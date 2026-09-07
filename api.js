/**
 * @module api
 * Cliente Supabase com retry, timeout e paginação
 */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { state } from "./state.js";
import {
  toDateKey, pairKey, localDateKey, chunks,
  withRetry, withTimeout, FETCH_PAGE, INSERT_CHUNK
} from "./utils.js";


/**
 * A configuração vem de supabase-config.js:
 *   window.SB_URL
 *   window.SB_KEY
 *
 * Se esse ficheiro falhar, usa produção por defeito.
 */
const SUPABASE_URL =
  (typeof window !== "undefined" && window.SB_URL) ||
  "https://uxeywgginnnlxqnfktwq.supabase.co";

const SUPABASE_ANON_KEY =
  (typeof window !== "undefined" && window.SB_KEY) ||
  "sb_publishable_Y6uSHpBSgb2DddNvIK7fiw_fXdNcpf7";

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Fetch paginado genérico */
export const fetchAllPages = async (makeQuery, pageSize = FETCH_PAGE) => {
  let from = 0;
  let all = [];

  while (true) {
    const result = await withTimeout(
      withRetry(() => makeQuery(from, from + pageSize - 1)),
      30000
    );

    if (result.error) return { error: result.error };

    const rows = result.data || [];
    all = all.concat(rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { data: all };
};

/** Carregar turnos para o signup */
export const loadTurnos = async () => {
  const { data, error } = await db
    .from("turnos")
    .select("id,nome")
    .order("id");

  if (error) return [];
  return data || [];
};

/** Inserção em bulk com dedupe + fallback */
export const insertRecords = async (rows) => {
  const today = localDateKey();
  const uniqueMap = new Map();

rows.forEach(r => {
  const pos = r.posicao ?? 0;
  const key = `${r.user_id}|${r.manobra_id}|${toDateKey(r.realizado_em)}|${pos}`;
  if (!uniqueMap.has(key)) {
    uniqueMap.set(key, {
      ...r,
      criado_por: r.criado_por || state.user?.id || null,
      realizado_em: toDateKey(r.realizado_em),
      posicao: pos
    });
  }
});

  const unique = [...uniqueMap.values()];

  const valid = unique.filter(r =>
    r.user_id &&
    r.manobra_id !== undefined &&
    r.manobra_id !== null &&
    r.manobra_id !== "" &&
    r.realizado_em &&
    r.realizado_em <= today
  );

  const ignoredFuture = unique.length - valid.length;

  if (!valid.length) {
    return {
      inserted: 0,
      ignored: ignoredFuture
    };
  }

  let inserted = 0;

  try {
    for (const chunk of chunks(valid, INSERT_CHUNK)) {
      const { data, error } = await withTimeout(
        withRetry(() =>
          db.from("registos")
            .upsert(chunk, {
              onConflict: "user_id,manobra_id,realizado_em,posicao",
              ignoreDuplicates: true
            })
            .select("id")
        )
      );

      if (error) throw error;

      inserted += data?.length || 0;
    }

    return {
      inserted,
      ignored: Math.max(0, valid.length - inserted) + ignoredFuture
    };
  } catch (_) {
    let fallbackInserted = 0;

    for (const chunk of chunks(valid, 200)) {
      const userIds = [...new Set(chunk.map(r => r.user_id))];
      const moveIds = [...new Set(chunk.map(r => r.manobra_id))];

      const { data: existing, error: readError } = await fetchAllPages((from, to) =>
        db.from("registos")
          .select("user_id,manobra_id,realizado_em,posicao")
          .in("user_id", userIds)
          .in("manobra_id", moveIds)
          .range(from, to)
      );

      if (readError) return { error: readError };

      const seen = new Set(
        (existing || []).map(r =>
          `${r.user_id}|${r.manobra_id}|${toDateKey(r.realizado_em)}|${r.posicao ?? 0}`
        )
      );

      const toInsert = chunk.filter(r =>
        !seen.has(`${r.user_id}|${r.manobra_id}|${r.realizado_em}|${r.posicao ?? 0}`)
      );
      
      if (!toInsert.length) continue;

      const { error: bulkError } = await db
        .from("registos")
        .insert(toInsert);

      if (!bulkError) {
        fallbackInserted += toInsert.length;
      } else if (bulkError.code === "23505") {
        for (const row of toInsert) {
          const { error: rowError } = await db
            .from("registos")
            .insert(row);

          if (!rowError) fallbackInserted++;
          else if (rowError.code !== "23505") return { error: rowError };
        }
      } else {
        return { error: bulkError };
      }
    }

    return {
      inserted: fallbackInserted,
      ignored: Math.max(0, valid.length - fallbackInserted) + ignoredFuture
    };
  }
};

/** Carregar manobras ativas */
export const loadMoves = async (force = false) => {
  const { isSpecialMove } = await import("./utils.js");
  const { renderMoveSelect } = await import("./ui.js");

  if (!force && !state.movesDirty && state.moves.length) return state.moves;
  if (state.promises.moves && !force) return state.promises.moves;

  state.promises.moves = (async () => {
    const { data, error } = await fetchAllPages((from, to) =>
      db.from("manobras")
        .select("id,nome,ativo,especial")
        .eq("ativo", true)
        .order("nome")
        .range(from, to)
    );

    if (error) throw error;

    state.moves = data || [];
    state.movesDirty = false;

    /**
     * Preferimos a flag especial, mas mantemos fallback pelo nome
     * para compatibilidade com a app atual.
     */
    state.specialMove =
      state.moves.find(m => m.especial === true) ||
      state.moves.find(isSpecialMove) ||
      null;

    renderMoveSelect();

    return state.moves;
  })();

  try {
    return await state.promises.moves;
  } finally {
    state.promises.moves = null;
  }
};

/** Turno visível para a sessão atual (null = vê tudo) */
export const visibleTurnoId = () => {
  const role = state.profile?.role;
  if (role === "chefe_cordas" || role === "chefe") return null;
  return state.profile?.turno_id ?? null;
};

/** Carregar operacionais visíveis para a sessão atual */
export const loadPeople = async (force = false) => {
  if (!force && !state.peopleDirty && state.people.length) return state.people;
  if (state.promises.people && !force) return state.promises.people;
  state.promises.people = (async () => {
    const { data, error } = await fetchAllPages((from, to) =>
      db.from("profiles")
        .select("id,nome,numero_operacional,role,ativo,so_teleferico,turno_id,curso_ra,curso_ru,curso_rt,tele_posicao,email,quartel,turno_origem,veio_cid,gestor")
        .order("numero_operacional")
        .range(from, to)
    );
    if (error) throw error;
    let people = (data || []).sort((a, b) =>
      Number(a.numero_operacional || 0) - Number(b.numero_operacional || 0)
    );
    const t = visibleTurnoId();
    if (t != null) {
      people = people.filter(p =>
        (p.turno_id === t || p.id === state.user?.id) && p.role !== "chefe_cordas"
      );
    }
    state.people = people;
    state.peopleDirty = false;
    return state.people;
  })();
  try { return await state.promises.people; } finally { state.promises.people = null; }
};

/** Criar conta de cordas (password aleatória + link de primeiro acesso) */
export const sendFirstAccessLink = async (email) =>
  db.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });

export const signupCordas = async ({ email }) => {
  const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "tmp-cordas-transfer" }
  });
  const rand = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const { data, error } = await tmp.auth.signUp({ email, password: rand, options: { data: { role: "chefe_cordas" } } });
  if (error) return { error };
  if (data.session) await tmp.auth.signOut();
  await sendFirstAccessLink(email);
  return { id: data.user?.id || null, error: null };
};

export const signupOperacional = async ({ numero, email, turno, externo = false, quartel = null, turnoOrigem = null, sendLink = true }) => {
  const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "tmp-cordas-signup" }
  });
  const rand = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const { data, error } = await tmp.auth.signUp({
    email,
    password: rand,
    options: { data: externo ? { numero_operacional: numero, role: "externo" } : { numero_operacional: numero, turno_id: turno } }
  });
  if (error) return { error };
  if (data.session) await tmp.auth.signOut();
  const { error: e2 } = await db.from("profiles").upsert(
    externo
      ? { id: data.user.id, numero_operacional: numero, email, role: "externo", quartel: quartel || null, turno_origem: turnoOrigem || null, turno_id: null, ativo: true }
      : { id: data.user.id, numero_operacional: numero, email, role: "operacional", turno_id: turno, ativo: true },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (e2) return { error: e2 };
  if (sendLink) await sendFirstAccessLink(email);
  return { error: null };
};

export const loadExternos = async () => [];

/** Carregar atribuições da manobra especial Teleférico */
export const loadSpecialAssignments = async (force = false) => {
  if (!force && state.promises.special) return state.promises.special;
  state.promises.special = (async () => {
    const { data, error } = await withTimeout(
      db.from("profiles")
        .select("id")
        .not("curso_rt", "is", null)
        .eq("ativo", true)
    );
    if (error) { state.specialAssignments.clear(); return; }
    state.specialAssignments = new Set((data || []).map(r => String(r.id)));
  })();
  await state.promises.special;
  state.promises.special = null;
};

export const loadLatestAll = async (force = false) => {
  if (!force && state.allLoaded && !state.allDirty) return state.latestAll;
  if (state.promises.all && !force) return state.promises.all;

  state.promises.all = (async () => {
    const { data, error } = await withTimeout(
      withRetry(() =>
        db.from("v_ultimo_registo")
          .select("user_id,manobra_id,realizado_em")
      )
    );

    if (error) throw error;

    const map = new Map();

    (data || []).forEach(r => {
      const k = toDateKey(r.realizado_em);
      if (!k) return;
      map.set(pairKey(r.user_id, r.manobra_id), k);
    });

    state.latestAll = map;
    state.allLoaded = true;
    state.allDirty = false;

    return state.latestAll;
  })();

  try {
    return await state.promises.all;
  } finally {
    state.promises.all = null;
  }
};

/** Dados do utilizador atual */
export const loadMyData = async (force = false) => {
  if (!state.user) return [];

  if (!force && state.myLoaded && !state.myDirty) return state.myRows;
  if (state.promises.my && !force) return state.promises.my;

  state.promises.my = (async () => {
    const { data, error } = await fetchAllPages((from, to) =>
      db.from("registos")
        .select("id,realizado_em,manobra_id,manobras(nome)")
        .eq("user_id", state.user.id)
        .order("realizado_em", { ascending: false })
        .range(from, to)
    );

    if (error) throw error;

    state.myRows = data || [];

    const map = new Map();

    state.myRows.forEach(r => {
      const k = toDateKey(r.realizado_em);
      if (!k) return;

      const key = String(r.manobra_id);
      const old = map.get(key);

      if (!old || k > old) map.set(key, k);
    });

    state.latestMine = map;
    state.myLoaded = true;
    state.myDirty = false;

    return state.myRows;
  })();

  try {
    return await state.promises.my;
  } finally {
    state.promises.my = null;
  }
};

/**
 * Carregar/criar perfil.
 * No signup, o turno vem em user_metadata.turno_id.
 */
export const loadProfile = async (user) => {
  const { data } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (data) return data;

  const numero = user.user_metadata?.numero_operacional || "";
  const turnoRaw = user.user_metadata?.turno_id;
  const turnoId =
    turnoRaw === undefined || turnoRaw === null || turnoRaw === ""
      ? null
      : Number(turnoRaw);

const payload = {
  id: user.id,
  numero_operacional: numero,
  email: user.email || null,
  role: "operacional",
  turno_id: turnoId
};

  const { data: created } = await db
    .from("profiles")
    .upsert(payload, {
      onConflict: "id",
      ignoreDuplicates: true
    })
    .select()
    .maybeSingle();

  if (created) return created;

  const { data: again } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (again) return again;

  throw new Error("Perfil indisponível");
};

export { SUPABASE_URL, SUPABASE_ANON_KEY };
