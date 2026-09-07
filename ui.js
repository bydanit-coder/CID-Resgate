/**
 * @module ui
 * Renderização, modais, feedback, skeletons, anel de prontidão
 */
import { state, tokens, flags, invalidatePeople } from "./state.js";
import { db, loadMoves, loadPeople, loadTurnos, loadSpecialAssignments, loadLatestAll, loadMyData, loadExternos, visibleTurnoId } from "./api.js";
import {
  escape, isSpecialMove, byName, formatDate, localDateKey, nextDateKey,
  monthsSince, daysSince, estadoFromMonths, estadoFromDays, statusOrder,
  NO_RECORD_MONTHS, pairKey, FIND_PAGE, MINE_PAGE,
  estadoFromRecord, daysForRecord, monthsForRecord, isFutureRecord,
  ordenaHistorico, cursoAtivo
} from "./utils.js";

const $ = (id) => document.getElementById(id);

export const M = (id, text, type = "e") => {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = text ? "msg " + type : "msg";
};

export const S = (id, items, placeholder) => {
  $(id).innerHTML = `<option value="">${placeholder}</option>` +
    items.map(x => `<option value="${x.id}">${escape(x.nome)}</option>`).join("");
};

export const setBtnBusy = (btn, busy, label) => {
  if (!btn) return;
  if (busy) {
    btn.dataset.busyLabel = btn.textContent;
    btn.disabled = true;
    btn.classList.add("busy");
    if (label) btn.textContent = label;
  } else {
    btn.disabled = false;
    btn.classList.remove("busy");
    if (btn.dataset.busyLabel !== undefined) btn.textContent = btn.dataset.busyLabel;
    delete btn.dataset.busyLabel;
  }
};

export const toast = (msg, type = "info", ms = 3500) => {
  const container = $("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s ease";
    setTimeout(() => el.remove(), 300);
  }, ms);
};

export const announce = (msg) => {
  const el = $("announcer");
  if (!el) return;
  el.textContent = "";
  requestAnimationFrame(() => { el.textContent = msg; });
};

export const updateOnlineStatus = () => {
  const banner = $("offlineBanner");
  if (!banner) return;
  banner.classList.toggle("show", !navigator.onLine);
  state.online = navigator.onLine;
};

export const applyLegend = () => {
  const INFO_LEGEND = `<div class="info-wrap"><button class="info-btn" type="button" aria-label="Legenda do código de cores" aria-expanded="false">i</button><div class="info-pop hide"><div class="info-item"><i class="dot dg"></i><span>Verde: até 2 meses</span></div><div class="info-item"><i class="dot dy"></i><span>Amarelo: até 5 meses</span></div><div class="info-item"><i class="dot dr"></i><span>Vermelho: até 8 meses</span></div><div class="info-item"><i class="dot dk"></i><span>Preto: mais de 8 meses</span></div></div></div>`;
  document.querySelectorAll(".legend-slot").forEach(el => el.innerHTML = INFO_LEGEND);
};

/* ================= SKELETON LOADING ================= */
export const skList = (n = 4, h = 44) =>
  Array.from({ length: n }, () => `<div class="skeleton" style="height:${h}px"></div>`).join("");
export const skTeam = () => skList(4, 68);
export const skStatus = () => skList(4, 44);

/* ================= ANEL DE PRONTIDÃO + CONTADOR ================= */
const RING_C = 326.7;
export const animateCount = (el, from, to, suffix = "", dur = 800) => {
  if (!el) return;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const v = Math.round(from + (to - from) * k);
    el.textContent = v + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
export const renderReadiness = (pct, metrics) => {
  const fg = $("ringFg"), pctEl = $("ringPct"), legend = $("teamReadiness");
  const target = pct || 0;
  if (fg) {
    fg.style.strokeDashoffset = String(RING_C * (1 - target / 100));
    fg.style.stroke = target >= 75 ? "var(--green)" : target >= 50 ? "var(--yellow)" : target >= 25 ? "var(--red)" : "var(--black)";
  }
  animateCount(pctEl, 0, target, "%");
  if (legend) legend.textContent = metrics && metrics.total
    ? `Verde: ${metrics.g} · Amarelo: ${metrics.y} · Vermelho: ${metrics.r} · Preto: ${metrics.k}`
    : "Sem dados de prontidão.";
};

/* ================= MODAL DE CONFIRMAÇÃO ================= */
export const openConfirm = ({ title = "Confirmar", message = "", confirmLabel = "Confirmar" } = {}) =>
  new Promise(resolve => {
    const modal = $("confirmModal");
    if (!modal) { resolve(confirm(message)); return; }
    flags.confirmResolver = resolve;
    $("confirmTitle").textContent = title;
    $("confirmMsg").textContent = message;
    $("confirmOk").textContent = confirmLabel;
    modal.classList.remove("hide");
    modal.style.zIndex = "1300";
    updateModalOverflow();
    setTimeout(() => $("confirmOk").focus(), 50);
  });

export const bindConfirmModal = () => {
  const modal = $("confirmModal");
  if (!modal) return;
  const done = (v) => {
    if (flags.confirmResolver) { flags.confirmResolver(v); flags.confirmResolver = null; }
    modal.classList.add("hide");
    updateModalOverflow();
  };
  $("confirmOk").onclick = () => done(true);
  $("confirmCancel").onclick = () => done(false);
  $("confirmClose").onclick = () => done(false);
  modal.onclick = (e) => { if (e.target === modal) done(false); };
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hide")) done(false);
  });
};

const BIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;
const CHIEF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
const POWER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>`;

const MENU = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:20px;height:20px"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`; 
export const ICONS = { BIN, CHIEF, POWER, MENU };

export const isCordas = () => state.profile?.role === "chefe_cordas";
export const isChefeTurno = () => state.profile?.role === "chefe_turno";
export const isChief = () => isCordas() || isChefeTurno();
export const panelVisible = (name) => $(name)?.classList.contains("on");
export const userIsTeleferico = (uid) => state.specialAssignments.has(String(uid));
export const isSpecialMoveId = (id) => state.specialMove && String(state.specialMove.id) === String(id);

const pairScore = (s, hasRecord) => {
  if (s === "g") return 100;
  if (s === "y") return 75;
  if (s === "r") return 50;
  return hasRecord ? 25 : 0;
};

export const applicableMovesForUser = (uid) => {
  const person = state.people.find(p => String(p.id) === String(uid));
  // ✅ "só teleférico": não conta nas manobras normais
  const normal = person?.so_teleferico ? [] : state.moves.filter(m => !isSpecialMove(m)).sort(byName);
  const special = state.moves.filter(m => isSpecialMove(m) && userIsTeleferico(uid)).sort(byName);
  return [...normal, ...special];
};

export const renderMoveSelect = () => {
  const sel = $("move");
  if (!sel) return;
  const current = sel.value;
  const applicable = applicableMovesForUser(state.user?.id);
  S("move", applicable, "Selecionar manobra");
  if (applicable.some(m => String(m.id) === current)) sel.value = current;
};

export const renderMine = async (force = false) => {
  const token = ++tokens.mine;
  $("myStatus").innerHTML = skStatus();
  $("mine").innerHTML = skList(3, 40);
  try {
    if (force) state.myPage = 1;
    await loadMoves();
    await Promise.all([loadMyData(force), loadSpecialAssignments()]);
    if (token !== tokens.mine) return;
    renderMoveSelect();
    renderMineDom();
  } catch (_) {
    if (token !== tokens.mine) return;
    $("mineCount").textContent = "0 registos";
    $("mine").innerHTML = '<p class="empty">Não foi possível carregar.</p>';
    $("myStatus").innerHTML = '<p class="empty">Não foi possível carregar o estado.</p>';
    $("minePager").classList.add("hide");
  }
};

const renderMineDom = () => {
  const total = state.myRows.length;
  const pages = Math.max(1, Math.ceil(total / MINE_PAGE));
  if (state.myPage > pages) state.myPage = pages;
  const start = (state.myPage - 1) * MINE_PAGE;
  const pageRows = state.myRows.slice(start, start + MINE_PAGE);
  $("mineCount").textContent = `${total} registo${total === 1 ? "" : "s"}`;
  $("mine").innerHTML = pageRows.length
    ? pageRows.map(x => `<div class="mine-row"><strong>${escape(x.manobras?.nome || "—")}</strong><small>${formatDate(x.realizado_em)}</small></div>`).join("")
    : '<p class="empty">Ainda não tens registos.</p>';
  const applicable = applicableMovesForUser(state.user?.id);
  $("myStatus").innerHTML = applicable.map(m => {
    const dt = state.latestMine.get(String(m.id));
    const [s, dot] = estadoFromRecord(dt);
    const days = daysForRecord(dt);
    const label = !dt ? "-" : (isFutureRecord(dt) ? "—" : `${days}d`);
    return `<article class="mini status-${s}"><strong>${escape(m.nome)}</strong><span><i class="dot ${dot}"></i>${label}</span></article>`;
  }).join("") || '<p class="empty">Sem manobras configuradas.</p>';
  const pager = $("minePager");
  pager.classList.toggle("hide", total <= MINE_PAGE);
  $("minePageInfo").textContent = `Página ${pages ? state.myPage : 1} de ${pages}`;
  $("minePrev").disabled = state.myPage <= 1;
  $("mineNext").disabled = state.myPage >= pages;
};

export const rerenderMinePage = () => renderMineDom();

const renderTeamUserFilter = () => {
  const container = $("teamUserFilter");
  if (!container) return;
  if (!state.people.length) { container.innerHTML = '<p class="empty">Sem operacionais.</p>'; return; }
  container.innerHTML = state.people.filter(p => p.ativo !== false).map(p => {
    const uid = String(p.id);
    const checked = state.selectedTeamUsers.has(uid) ? " checked" : "";
    const bd = teleBadge(p);     return `<label class="team-filter-chip"><input type="checkbox" class="team-user-check" data-u="${uid}"${checked}><span>${escape(p.numero_operacional || p.nome || "—")}</span>${bd ? `<i style="flex:none;font-style:normal;font-size:.55rem;font-weight:800;color:#1261a0">${bd.t}</i>` : ""}</label>`;
  }).join("");
};

const ringSVG = (pct, size = 76, sw = 8, delay = 0) => {
  const col = pct >= 75 ? "var(--green)" : pct >= 50 ? "var(--yellow)" : pct >= 25 ? "var(--red)" : "var(--black)";
  return `<div class="ring" data-p="${pct}" style="--p:0;--col:${col};--sw:${sw}px;width:${size}px;height:${size}px;transition-delay:${delay}ms"><span class="ring-txt" data-pct="${pct}" style="font-size:${size/4.4}px">0%</span></div>`;
};
const startRings = (root) => {
  if (!root) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll(".ring").forEach(r => { r.style.setProperty("--p", r.dataset.p); });
  }));
  root.querySelectorAll(".ring-txt").forEach(txt => animateCount(txt, 0, Number(txt.dataset.pct) || 0, "%", 900));
};

const ringWithBadge = (pct, size, sw, label) => `<div style="position:relative;display:inline-flex">${ringSVG(pct, size, sw)}<span style="position:absolute;top:-4px;left:-6px;background:var(--navy);color:var(--white);border-radius:8px;padding:1px 6px;font-size:.62rem;font-weight:800;letter-spacing:.4px;box-shadow:0 1px 3px rgba(8,35,63,.3)">${escape(label)}</span></div>`;

const CORES = { g: { bg: "#e7f2ec", bd: "#177245" }, y: { bg: "#f7f0e0", bd: "#9b6700" }, r: { bg: "#f9e9eb", bd: "#c62032" }, k: { bg: "#ededed", bd: "#111" } };

const cursoCor = (d) => {
  const resta = 4 * 365 - (new Date() - new Date(d)) / 86400000;
  if (resta < 0) return { bd: "#111", bg: "#ededed" };        // caducado
  if (resta <= 365) return { bd: "#c62032", bg: "#f9e9eb" };  // ≤ 1 ano
  if (resta <= 730) return { bd: "#9b6700", bg: "#f7f0e0" };  // ≤ 2 anos
  return { bd: "#177245", bg: "#e7f2ec" };                    // resto
};

const extTag = (p) => {
  const q = String(p.quartel || "").trim();
  const tag = q ? q.slice(0, 3).toUpperCase() : "EXT";
  return p.turno_origem ? `${tag}·${p.turno_origem}` : tag;
};
document.addEventListener("click", (e) => {
  const vchip = e.target.closest(".val-chip");
  if (!vchip) return;
  openCursoHist(vchip.dataset.u, vchip.dataset.c);
});
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#extToggle");
  if (!btn) return;
  const rest = $("extRest");
  if (!rest) return;
  const hidden = rest.classList.toggle("hide");
  btn.textContent = hidden ? `Mostrar todos (${btn.dataset.total})` : "Mostrar só RT";
});
const valChip = (c) => {
  const col = cursoCor(c.d);
  const p = c.p;
  const tag = p.role === "externo" ? extTag(p) : (p.turno_id ? "T" + p.turno_id : "");
  return `<button type="button" class="val-chip" data-u="${p.id}" data-c="curso_${String(c.lab).toLowerCase()}" style="display:flex;flex-direction:column;align-items:center;gap:2px;border:1px solid ${col.bd};color:${col.bd};background:${col.bg};border-radius:10px;padding:6px 2px;font-size:.7rem;font-weight:800;line-height:1.15;text-align:center;min-width:0;min-height:0;cursor:pointer;box-shadow:none">
    <span style="white-space:nowrap">${escape(p.numero_operacional || "—")}${tag ? " · " + tag : ""}</span>
    <span style="font-size:.6rem;font-weight:700;white-space:nowrap">${c.lab} · ${formatDate(c.d)}</span>
  </button>`;
};

const valGrid = (title, items) => items.length ? `<div style="border:1px solid var(--line);border-left:4px solid var(--navy);border-radius:12px;padding:12px;margin-bottom:14px;background:var(--white);box-shadow:var(--shadow-soft)">
  <h3 style="margin:0 0 8px">${title}</h3>
  <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px">${items.map(valChip).join("")}</div>
</div>` : "";

const telePersonScore = (uid) => {
  const W = { 1: 0.5, 2: 0.5 / 3, 3: 0.5 / 3, 4: 0.5 / 3 };
  let s = 0;
  [1, 2, 3, 4].forEach(pos => {
    const dt = state.telePosData?.get(`${uid}-${pos}`);
    const [st] = estadoFromRecord(dt);
    s += W[pos] * pairScore(st, !!dt && !isFutureRecord(dt));
  });
  return s;
};

const teleOverallMonths = (uid) => {
  const W = { 1: 0.5, 2: 0.5 / 3, 3: 0.5 / 3, 4: 0.5 / 3 };
  let s = 0; [1, 2, 3, 4].forEach(pos => { const dt = state.telePosData?.get(`${uid}-${pos}`); s += W[pos] * monthsForRecord(dt); });
  return s;
};

const telePosReg = (p) => [1, 2, 3, 4].map(pos => {
  const dt = state.telePosData?.get(`${p.id}-${pos}`);
  const days = dt ? daysSince(dt) : null;
  const col = CORES[estadoFromRecord(dt)[0]];
  const label = pos === 3 ? "T" : pos === 4 ? "VE" : String(pos);
  return `<button type="button" class="tele-pos-reg" data-u="${p.id}" data-pos="${pos}" style="text-align:center;padding:3px 6px;border-radius:6px;background:${col.bg};border:1px solid ${col.bd};min-width:32px;cursor:pointer">
    <div style="font-size:.7rem;font-weight:700;color:${col.bd}">${label}</div>
    <div style="font-size:.55rem;color:var(--muted)">${days === null ? "—" : days + "d"}</div>
  </button>`;
}).join("");

const telePosChips = (uid, clickable = false) => [1, 2, 3, 4].map(pos => {
  const dt = state.telePosData?.get(`${uid}-${pos}`);
  const days = dt ? daysSince(dt) : null;
  const col = CORES[estadoFromRecord(dt)[0]];
  const label = pos === 3 ? "T" : pos === 4 ? "VE" : String(pos);
  const tag = clickable ? "button" : "div";
  const attrs = clickable ? `type="button" class="pos-reg" data-pos="${pos}"` : "";
  return `<${tag} ${attrs} style="text-align:center;padding:2px 4px;border-radius:5px;background:${col.bg};border:1px solid ${col.bd};min-width:26px;cursor:${clickable ? "pointer" : "default"}">
    <div style="font-size:.62rem;font-weight:700;color:${col.bd}">${label}</div>
    <div style="font-size:.5rem;color:var(--muted)">${days === null ? "—" : days + "d"}</div>
  </${tag}>`;
}).join("");
const teleCard = (p) => `<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--white)">
  <div style="font-size:.8rem;font-weight:800;color:var(--navy);min-width:34px;text-align:center">${escape(p.numero_operacional || "—")}</div>
  <div style="display:flex;gap:4px;margin-left:auto">${telePosChips(p.id)}</div>
</div>`;

export const nomeFromEmail = (email) => {
  if (!email) return "";
  const local = String(email).split("@")[0] || "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const full = parts.filter(s => s.length > 1);   // ignora iniciais do meio (ex.: "A")
  const used = full.length ? full : parts;        // se tudo for inicial, usa tudo
  return used.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
};

const auditPosBadge = (r) => {
  const col = CORES[estadoFromRecord(r.data)[0]];
  return ` <span style="display:inline-block;margin-left:6px;padding:2px 7px;border-radius:5px;background:${col.bg};border:1px solid ${col.bd};vertical-align:middle;font-size:.68rem;font-weight:700;color:${col.bd}">${posLabel(r.posicao)}</span>`;
};

const posLabel = (p) => p === 3 ? "T" : p === 4 ? "VE" : String(p);
const POS_INFO = { 1: { t: "P1", d: "Posição 1 — Resgatador" }, 2: { t: "P2", d: "Posição 2 — Resgatador" }, 3: { t: "P3", d: "Posição 3 — Terra" } };
const teleBadge = (p) => {
  if (p.so_teleferico) return { t: "ST", d: "Só teleférico" };
  if (state.specialAssignments.has(String(p.id)))   return { t: "T", d: "Curso de teleférico" };
  return null;
};

const applicableMovesFor = (person) => {
  const normal = person?.so_teleferico ? [] : state.moves.filter(m => !isSpecialMove(m));
  const special = state.moves.filter(m => isSpecialMove(m) && state.specialAssignments.has(String(person.id)));
  return [...normal, ...special];
};

const metricsForPeople = (people) => {
  const m = { g: 0, y: 0, r: 0, k: 0, total: 0, sum: 0 };
  people.forEach(p => applicableMovesFor(p).forEach(mv => {
    const dt = state.latestAll.get(pairKey(p.id, mv.id));
    const [s] = estadoFromRecord(dt);
    m[s]++; m.total++; m.sum += pairScore(s, !!dt && !isFutureRecord(dt));
  }));
  return { ...m, pct: m.total ? Math.round(m.sum / m.total) : 0 };
};

export const renderOverview = async () => {
  const box = $("ov");
  box.innerHTML = skList(3, 80);
  await loadMoves();
  await Promise.all([loadPeople(), loadLatestAll(), loadSpecialAssignments()]);
  const turnos = await loadTurnos();
  
  await loadExternos();
  const teleMv = state.moves.find(m => isSpecialMove(m));
  if (teleMv) await loadTelePosData(teleMv.id);
  if (state.overviewTurno) { renderTurnoDetail(turnos); return; }
    if (state.overviewTele) {
    const teleMove = state.moves.find(m => isSpecialMove(m));
    if (teleMove) await loadTelePosData(teleMove.id);
    renderTelefericoDetail(turnos);
    return;
  }

  const per = turnos.map(t => {
  const people = state.people.filter(p => p.ativo !== false && p.turno_id === t.id && p.role !== "chefe_cordas");
  return { t, people, m: metricsForPeople(people) };
  });
  const company = Math.round(per.reduce((s, x) => s + x.m.pct, 0) / (per.length || 1));
  const teleMove = state.moves.find(m => isSpecialMove(m));
  const telePeople = state.people.filter(p => p.ativo && state.specialAssignments.has(String(p.id)));
  const telePct = telePeople.length ? Math.round(telePeople.reduce((t, p) => t + telePersonScore(p.id), 0) / telePeople.length) : 0;

  box.innerHTML = `
        <div style="display:flex;justify-content:flex-end"><div class="legend-slot"></div></div>
    <div style="display:flex;gap:26px;justify-content:center;align-items:flex-end;flex-wrap:wrap;margin:6px 0 16px">
      <div class="ov-company" style="gap:6px">${ringSVG(company, 150, 13, 700)}<strong style="font-size:1.05rem;font-weight:800;color:var(--navy)">Companhia</strong></div>
      <button id="ovTele" type="button" style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;background:none;border:none;padding:0">${ringSVG(telePct, 92, 9)}<strong style="font-size:.9rem;font-weight:800;color:var(--navy)">Teleférico</strong></button>
    </div>
    <div class="ov-grid">
      ${per.map(x => `
      <div class="turno-card" data-t="${x.t.id}" style="cursor:pointer;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--white);box-shadow:var(--shadow-soft);display:flex;flex-direction:column;align-items:center;gap:6px">
        ${ringWithBadge(x.m.pct, 76, 8, x.t.nome)}
      </div>`).join("")}
    </div>`;  
    startRings($("ov"));
};

applyLegend();

const renderTelefericoDetail = (turnos) => {
  const teleMove = state.moves.find(m => isSpecialMove(m));
  if (!teleMove) { $("ov").innerHTML = `<button id="ovBack" class="secondary">← Voltar</button><p>Manobra de teleférico não encontrada.</p>`; return; }
  const assigned = state.people.filter(p => p.ativo && state.specialAssignments.has(String(p.id)));
  const perTurno = turnos.map(t => {
    const list = assigned.filter(p => p.turno_id === t.id);
    return { t, list, pct: list.length ? Math.round(list.reduce((a, p) => a + telePersonScore(p.id), 0) / list.length) : 0 };
  });
  const personCard = (p, ext = false) => `<div style="border:1px solid var(--line);border-radius:8px;padding:6px 4px;background:var(--white);display:flex;flex-direction:column;align-items:center;gap:4px">
    <div style="font-size:.78rem;font-weight:800;color:var(--navy);line-height:1">${escape(p.numero_operacional || "—")}</div>
    ${ext ? `<div style="font-size:.55rem;font-weight:800;color:#1261a0;line-height:1">${extTag(p)}</div>` : ""}
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:3px;width:100%">${telePosReg(p)}</div>
  </div>`;
  const extList = assigned.filter(p => !p.turno_id);
  const rtVal = assigned.filter(p => p.curso_rt).map(p => ({ p, lab: "RT", d: p.curso_rt }));
  rtVal.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  $("ov").innerHTML = `<div style="position:relative;display:flex;align-items:center;margin:0 0 14px">
      <button id="ovBack" class="secondary" type="button">← Voltar</button>
      <h2 style="margin:0;position:absolute;left:50%;transform:translateX(-50%);color:var(--navy);font-size:1.3rem;white-space:nowrap">Teleférico</h2>
    </div>
    <div style="display:grid;gap:12px">
      ${perTurno.map(x => `<div style="border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--white);box-shadow:var(--shadow-soft)">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px">
          <div style="display:flex;align-items:center;justify-content:center;min-height:64px">${ringWithBadge(x.pct, 56, 6, x.t.nome)}</div>
          ${x.list.map(p => personCard(p)).join("") || '<p class="empty" style="grid-column:1/-1">Sem operacionais.</p>'}
        </div>
      </div>`).join("")}
      ${extList.length ? `<div style="border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--white);box-shadow:var(--shadow-soft)">
        <h3 style="margin:0 0 10px;font-size:1rem;font-weight:800;color:var(--navy)">Externos</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px">${extList.map(p => personCard(p, true)).join("")}</div>
      </div>` : ""}
    </div>
    ${valGrid("Validade do RT (16 mais antigos)", rtVal.slice(0, 16))}`;
  startRings($("ov"));
};

applyLegend();

const renderTurnoDetail = (turnos) => {
  const t = turnos.find(x => x.id === state.overviewTurno);
  const people = state.people.filter(p => p.ativo && p.turno_id === t.id && p.role !== "chefe_cordas");
  const tm = metricsForPeople(people);

  const items = state.moves.filter(m => !isSpecialMove(m)).map(m => {
    const subset = people.filter(p => !p.so_teleferico);
    const elementos = subset.map(p => {
      const dt = state.latestAll.get(pairKey(p.id, m.id));
      const [s, dot] = estadoFromRecord(dt);
      const days = daysForRecord(dt);
      const label = !dt ? "—" : (isFutureRecord(dt) ? "—" : `${days}d`);
      return { p, s, dot, label, numero: p.numero_operacional || p.nome || "—" };
    });
    const counts = { g: 0, y: 0, r: 0, k: 0 };
    elementos.forEach(x => counts[x.s]++);
    let statusClass = "status-none";
    if (elementos.length) {
      const mediaMonths = Math.round(elementos.reduce((acc, x) => acc + monthsForRecord(state.latestAll.get(pairKey(x.p.id, m.id))), 0) / elementos.length);
      statusClass = `status-${estadoFromMonths(mediaMonths)[0]}`;
    }
    const badge = [["r","dr"],["k","dk"],["y","dy"],["g","dg"]].filter(([k]) => counts[k] > 0)
      .map(([k, c]) => `<span style="display:inline-flex;gap:3px;align-items:center"><i class="dot ${c}"></i>${counts[k]}</span>`).join("");
    const els = elementos.map(x => `<div class="op-chip status-${x.s}"><span>${escape(x.numero)}</span><i class="dot ${x.dot}"></i><small style="color:var(--muted);font-weight:700">${x.label}</small></div>`).join("");
    const html = `<article class="team-card ${statusClass}"><button class="team-toggle" type="button"><span class="team-name">${escape(m.nome)}</span><span style="margin-left:auto;display:inline-flex;gap:6px;align-items:center;font-size:.72rem;font-weight:700;color:var(--muted)">${badge}</span><span class="arrow">⌄</span></button><div class="details"><div class="details-inner"><div class="op-grid">${els || '<p class="empty">Sem dados.</p>'}</div></div></div></article>`;
    return { html, bad: counts.r + counts.k, yel: counts.y, name: m.nome };
  });
  items.sort((a, b) => b.bad - a.bad || b.yel - a.yel || byName({ nome: a.name }, { nome: b.name }));
  const cards = items.map(x => x.html).join("");

  $("ov").innerHTML = `
    <button id="ovBack" class="secondary" type="button">← Voltar</button>
    <div style="display:flex;align-items:center;gap:14px;margin:14px 0 18px;flex-wrap:wrap">
      ${ringWithBadge(tm.pct, 110, 11, t?.nome || "Turno")}
      <div style="display:flex;flex-direction:column;gap:4px">
        <strong style="color:var(--navy);font-size:1.2rem;font-weight:800">${escape(t?.nome || "Turno")}</strong>
        <small style="color:var(--muted);font-size:.85rem">${people.length} operacionais</small>
        <div style="display:flex;gap:10px;font-size:.78rem;font-weight:700;color:var(--muted)">
          <span style="display:inline-flex;gap:4px;align-items:center"><i class="dot dg"></i>${tm.g}</span>
          <span style="display:inline-flex;gap:4px;align-items:center"><i class="dot dy"></i>${tm.y}</span>
          <span style="display:inline-flex;gap:4px;align-items:center"><i class="dot dr"></i>${tm.r}</span>
          <span style="display:inline-flex;gap:4px;align-items:center"><i class="dot dk"></i>${tm.k}</span>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px">${cards}</div>`;
  startRings($("ov"));
};

export const renderCordasManobras = async () => {
  const box = $("mv");
  box.innerHTML = skList(3, 60);
  const { data, error } = await db.from("manobras").select("id,nome,ativo,especial").order("nome");
  if (error) { box.innerHTML = `<p class="empty">${escape(error.message)}</p>`; return; }

  const ativas = (data || []).filter(m => m.ativo && !m.especial);
  const especial = (data || []).find(m => m.especial && m.ativo);
  const inativas = (data || []).filter(m => !m.ativo);

  const linha = (m, isEsp = false) => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:var(--white);box-shadow:var(--shadow-soft);position:relative">
      <div style="flex:1;min-width:0">
        <div style="font-weight:800;font-size:.9rem;color:var(--navy);line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escape(m.nome)}</div>
        ${isEsp ? `<small style="font-size:.68rem;color:var(--muted);font-weight:650">Manobra especial — protegida</small>` : ""}
      </div>
      ${isEsp
        ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:10px;background:#eef3f8;border:1px solid var(--line-dark);font-size:.68rem;font-weight:800;color:var(--navy);white-space:nowrap">🔒 Protegida</span>`
        : `<div style="display:flex;gap:5px">
            <button class="secondary mv-rename" data-i="${m.id}" data-n="${escape(m.nome)}" type="button" style="min-height:32px;min-width:32px;padding:0;font-size:.85rem" title="Renomear" aria-label="Renomear">✏️</button>
            ${m.ativo
              ? `<button class="deact-btn mv-disable" data-i="${m.id}" data-n="${escape(m.nome)}" type="button" title="Desativar" aria-label="Desativar">${POWER}</button>`
              : `<button class="secondary mv-enable" data-i="${m.id}" data-n="${escape(m.nome)}" type="button" style="min-height:32px;min-width:32px;padding:0;font-size:.85rem;color:var(--green);border-color:var(--green)" title="Reativar" aria-label="Reativar">✓</button>`}
          </div>`}
    </div>`;

  box.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <h3 style="margin:0;font-size:1.05rem;color:var(--navy)">Manobras</h3>
      <span style="padding:2px 9px;border-radius:10px;background:var(--blue-soft);color:var(--navy);font-size:.72rem;font-weight:800;border:1px solid var(--line)">${ativas.length + (especial ? 1 : 0)} ativa${ativas.length + (especial ? 1 : 0) === 1 ? "" : "s"}</span>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:16px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--white);box-shadow:var(--shadow-soft);align-items:center">
      <input id="mvNew" placeholder="Nome da nova manobra" style="flex:1;min-width:0">
      <button id="mvAdd" class="primary" type="button" style="flex:0 0 auto;width:auto;padding:10px 18px">+ Criar</button>
    </div>

    <div style="display:grid;gap:8px">
      ${especial ? linha(especial, true) : ""}
      ${ativas.length ? ativas.map(m => linha(m, false)).join("") : '<p class="empty">Sem manobras ativas.</p>'}
    </div>

    ${inativas.length ? `
    <details style="margin-top:20px;border:1px solid var(--line);border-radius:10px;background:var(--blue-pale);overflow:hidden">
      <summary style="cursor:pointer;padding:12px 14px;font-weight:800;font-size:.85rem;color:var(--navy);user-select:none;display:flex;align-items:center;gap:8px">
        <span style="padding:2px 8px;border-radius:10px;background:var(--line);color:var(--navy);font-size:.68rem;font-weight:800">${inativas.length}</span>
        Desativadas
      </summary>
      <div style="padding:10px 14px 14px;display:grid;gap:8px">
        ${inativas.map(m => linha(m, false)).join("")}
      </div>
    </details>
    ` : ""}

    <div id="mvm" class="msg" role="alert"></div>`;
};

let lastReportHTML = "";
let auditRows = [];
let auditFilters = { from: "", to: "", turno: "", move: "", num: "", mode: "manobras" };
let auditPage = 1;
const AUDIT_PAGE = 200;
let auditAlterRows = [];

const monthStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const loadAuditData = async () => {
  const turnos = await loadTurnos();
  await loadMoves();
  await loadPeople();
  const from = auditFilters.from || `${monthStr()}-01`;
  const to = auditFilters.to || localDateKey();
  const { data, error } = await db
    .from("registos")
    .select("id,realizado_em,user_id,manobra_id,criado_em,criado_por,posicao")
    .gte("realizado_em", from)
    .lte("realizado_em", to)
    .order("realizado_em", { ascending: false });
  if (error) { auditRows = []; return; }
  const pMap = new Map(state.people.map(p => [String(p.id), p]));
  const mMap = new Map(state.moves.map(m => [String(m.id), m]));
  const tMap = new Map(turnos.map(t => [t.id, t.nome]));
  auditRows = (data || []).map(r => {
    const p = pMap.get(String(r.user_id));
    const m = mMap.get(String(r.manobra_id));
    const rd = r.criado_em ? new Date(r.criado_em) : null;
    const regDate = rd && !isNaN(rd) ? `${rd.getFullYear()}-${String(rd.getMonth() + 1).padStart(2, "0")}-${String(rd.getDate()).padStart(2, "0")}` : "";
    return {
      id: r.id,
      data: r.realizado_em,
      regDate,
      turno: p?.turno_id ? tMap.get(p.turno_id) || "" : "",
      turno_id: p?.turno_id || null,
      num: p?.numero_operacional || "—",
      manobra: m?.nome || "—",
      manobra_id: r.manobra_id, posicao: r.posicao || null,
      user_id: r.user_id,
      criador: (pMap.get(String(r.criado_por))?.numero_operacional || pMap.get(String(r.criado_por))?.nome || nomeFromEmail(pMap.get(String(r.criado_por))?.email)) || "—"
    };
  });
};

const loadAuditAlterations = async () => {
  const from = auditFilters.from || `${monthStr()}-01`;
  const to = auditFilters.to || localDateKey();
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T23:59:59");
  const { data, error } = await db.from("auditoria").select("*")
    .gte("criado_em", start.toISOString()).lt("criado_em", end.toISOString())
    .order("criado_em", { ascending: false });
  auditAlterRows = error ? [] : (data || []);
};
const alterPersonId = (a) => a.tabela === "registos" ? ((a.dados_antigos && a.dados_antigos.user_id) || (a.dados_novos && a.dados_novos.user_id)) : a.registo_id;

const describeAlter = (a) => {
  const op = String(a.operacao || "").toUpperCase();
  const old = a.dados_antigos || {}, nw = a.dados_novos || {};
  const numRaw = nw.numero_operacional || old.numero_operacional;
  const num = numRaw ? `nº ${numRaw}` : (nw.nome || old.nome || nomeFromEmail(nw.email || old.email) || "—");
  const roleLbl = (r) => r === "externo" ? "externo" : r === "chefe_turno" ? "chefe de turno" : r === "chefe_cordas" ? "Chefe das Cordas" : "operacional";
  if (a.tabela === "profiles") {
    if (op === "INSERT") return `${num} criado (${roleLbl(nw.role)})`;
    if (op === "DELETE") return `${num} removido`;
    if (old.ativo !== nw.ativo) {   const base = nw.ativo === false ? `${num} desativado` : `${num} reativado`;   const trocouNum = old.numero_operacional !== nw.numero_operacional ? ` (nº ${old.numero_operacional || "—"} → ${nw.numero_operacional || "—"})` : "";   return base + trocouNum; }
    if (old.role !== nw.role) {
      if (nw.role === "chefe_cordas") return `${num} assume a Chefia das Cordas`;
      if (old.role === "chefe_cordas") return `${num} deixa a Chefia das Cordas`;
      if (nw.role === "chefe_turno") return `${num} promovido a Chefe de turno ${nw.turno_id ? "T" + nw.turno_id : ""}`;
      if (old.role === "chefe_turno" && nw.role === "operacional") return `${num} passa a operacional`;
      if (nw.role === "externo") return `${num} tornado externo (${nw.quartel || "—"}${nw.turno_origem ? " · " + nw.turno_origem : ""})`;
      if (old.role === "externo" && nw.role === "operacional") return `${num} importado para a CID ${nw.turno_id ? "T" + nw.turno_id : ""}`;
      return `${num} · papel: ${roleLbl(old.role)} → ${roleLbl(nw.role)}`;
    }
    if (old.numero_operacional !== nw.numero_operacional) return `nº ${old.numero_operacional} → ${nw.numero_operacional}`;
    if (old.turno_id !== nw.turno_id) return `${num} · mudança de turno ${old.turno_id ? "T" + old.turno_id : "—"} → ${nw.turno_id ? "T" + nw.turno_id : "—"}`;
    if (old.curso_rt !== nw.curso_rt) return `${num} · Curso RT → ${nw.curso_rt || "(limpo)"}`;
    if (old.curso_ru !== nw.curso_ru) return `${num} · Curso RU → ${nw.curso_ru || "(limpo)"}`;
    if (old.curso_ra !== nw.curso_ra) return `${num} · Curso RA → ${nw.curso_ra || "(limpo)"}`;
    if (old.gestor !== nw.gestor) return nw.gestor ? `${num} recebeu acesso à Gestão` : `${num} perdeu o acesso à Gestão`;
    if (old.so_teleferico !== nw.so_teleferico) return `${num} · "só teleférico" ${nw.so_teleferico ? "ativado" : "removido"}`;
    return `${num} · perfil alterado`;
  }
  if (a.tabela === "manobras") {
    if (op === "INSERT") return `Manobra criada: ${nw.nome || "—"}`;
    if (op === "DELETE") return `Manobra eliminada: ${old.nome || "—"}`;
    if (old.nome !== nw.nome) return `Manobra renomeada: ${old.nome} → ${nw.nome}`;
    if (old.ativo !== nw.ativo) return nw.ativo ? `Manobra reativada: ${nw.nome || old.nome || "—"}` : `Manobra desativada: ${old.nome || nw.nome || "—"}`;
    return `Manobra alterada: ${nw.nome || old.nome || "—"}`;
  }
  if (a.tabela === "registos") {
    if (op === "DELETE") {
      const da = a.dados_antigos || {};
      const mNome = da._manobra || moveLabel(da.manobra_id);
      const pNome = da._pessoa || "";
      const data = da.realizado_em ? formatDate(da.realizado_em) : "";
      return `Registo eliminado: ${mNome}${pNome ? " · nº " + pNome : ""}${data ? " · feito em " + data : ""}`;
    }
    if (op === "UPDATE") return `Registo alterado: ${moveLabel((a.dados_novos || {}).manobra_id)} → ${(a.dados_novos || {}).realizado_em || ""}`;
    return `Registo: ${op}`;
  }
  if (a.tabela === "turnos") return old.nome !== nw.nome ? `Turno renomeado: ${old.nome} → ${nw.nome}` : `Turno alterado: ${nw.nome || old.nome || "—"}`;
  return `${a.tabela} · ${op}`;
};

const filteredAlter = () => auditAlterRows.filter(a => {
  const op = String(a.operacao || "").toUpperCase();
  if (a.tabela === "registos" && op === "INSERT") return false;
  if (a.tabela === "operacional_manobra") return false;
  const p = state.people.find(x => String(x.id) === String(alterPersonId(a)));
  if (auditFilters.turno && (!p || String(p.turno_id) !== auditFilters.turno)) return false;
  if (auditFilters.num && !(p && String(p.numero_operacional || "").includes(auditFilters.num))) return false;
  return true;
});
const buildAuditCombined = (mode) => {
  const pById = (id) => state.people.find(x => String(x.id) === String(id));
  const out = [];
  if (mode === "manobras") filteredAudit().forEach(r => out.push({
    sort: (r.data || "") + "T" + (r.id || ""),
    data: r.data,
    reg: r.regDate || "",
    late: !!r.regDate && r.regDate !== r.data,
    num: r.num,
    descRaw: r.manobra + (r.posicao ? " [" + posLabel(r.posicao) + "]" : ""),
    descHtml: escape(r.manobra) + (r.posicao ? auditPosBadge(r) : ""),
    por: r.criador,
    delId: r.id,
    reatId: null
  }));
  if (mode === "alteracoes") filteredAlter().forEach(a => {
    const p = pById(String(alterPersonId(a)));
    const d = new Date(a.criado_em);
    const dateStr = isNaN(d) ? "—" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const desc = describeAlter(a);
    const isDeact = a.tabela === "profiles" && a.dados_novos && a.dados_novos.ativo === false;
    out.push({
      sort: a.criado_em,
      data: dateStr,
      reg: "",
      late: false,
      num: p?.numero_operacional || "—",
      descRaw: desc,
      descHtml: escape(desc),
      por: a.user_numero || pById(String(a.user_id))?.numero_operacional || pById(String(a.user_id))?.nome || nomeFromEmail(pById(String(a.user_id))?.email) || (a.user_id ? "—" : "SQL"),
      delId: null,
      reatId: isDeact && p && p.ativo === false ? p.id : null
    });
  });
  out.sort((a, b) => a.sort < b.sort ? 1 : -1);
  return out;
};
export const setAuditMode = (mode) => { auditFilters.mode = mode; renderAuditTable(); };

const filteredAudit = () => auditRows.filter(r => {
  if (auditFilters.turno && String(r.turno_id) !== auditFilters.turno) return false;
  if (auditFilters.move && String(r.manobra_id) !== auditFilters.move) return false;
  if (auditFilters.num && !String(r.num || "").includes(auditFilters.num)) return false;
  return true;
});

const renderAuditTable = () => {
  const mode = auditFilters.mode || "manobras";
  const rows = buildAuditCombined(mode);
  const turnoOpts = state.turnos_cache || [];
  const moveOpts = state.moves || [];
  const pages = Math.max(1, Math.ceil(rows.length / AUDIT_PAGE));
  if (auditPage > pages) auditPage = pages;
  const pageRows = rows.slice((auditPage - 1) * AUDIT_PAGE, auditPage * AUDIT_PAGE);
  $("au").innerHTML = `<h2>Relatório</h2>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select id="rpMode"><option value="mensal">Mensal</option><option value="anual">Anual</option></select>
      <input type="month" id="rpMonth" value="${monthStr()}">
      <input type="number" id="rpYear" class="hide" min="2000" max="2100" value="${new Date().getFullYear()}">
      <button id="rpGen" class="primary" type="button">Gerar</button>
      <button id="rpPrint" class="secondary hide" type="button">Imprimir / PDF</button>
    </div>
    <div id="rpOut" style="margin-top:14px"></div>
       <h2 style="margin-top:26px">Auditoria</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:4px">
      <div style="display:flex;flex-direction:column;gap:2px">
        <small class="muted" style="font-size:.7rem">Início</small>
        <input type="date" id="auFrom" value="${auditFilters.from || `${monthStr()}-01`}">
      </div>
      <span class="muted" style="align-self:flex-end;padding-bottom:6px">→</span>
      <div style="display:flex;flex-direction:column;gap:2px">
        <small class="muted" style="font-size:.7rem">Fim</small>
        <input type="date" id="auTo" value="${auditFilters.to || localDateKey()}" max="${localDateKey()}">
      </div>
      <select id="auTurno" style="align-self:flex-end"><option value="">Todos os turnos</option>${turnoOpts.map(t => `<option value="${t.id}" ${auditFilters.turno == t.id ? "selected" : ""}>${escape(t.nome)}</option>`).join("")}</select>
      <select id="auMode" style="align-self:flex-end">
        <option value="manobras" ${mode == "manobras" ? "selected" : ""}>Manobras</option>
        <option value="alteracoes" ${mode == "alteracoes" ? "selected" : ""}>Outros Registos</option>
      </select>
      <button id="auFilter" class="secondary" type="button" style="align-self:flex-end">Filtrar</button>
      <button id="auCsv" class="secondary" type="button" style="align-self:flex-end">⬇ CSV</button>
    </div>
    <p class="muted">${rows.length} registo${rows.length === 1 ? "" : "s"} no período.</p>
    <div style="max-height:60vh;overflow:auto;border:1px solid var(--line);border-radius:8px">
      <table style="width:100%;border-collapse:collapse;font-size:.82rem">
        <thead style="position:sticky;top:0;background:var(--navy);color:#fff">
          <tr><th style="padding:8px;text-align:left">Data</th><th style="padding:8px;text-align:left">Registado</th><th style="padding:8px;text-align:left">Nº</th><th style="padding:8px;text-align:left">Manobras e registos</th><th style="padding:8px;text-align:left">Por</th><th style="padding:8px"></th></tr>
        </thead>
        <tbody>
          ${pageRows.map(r => `<tr style="border-top:1px solid var(--line)">
            <td style="padding:6px 8px">${r.data}</td>
            <td style="padding:6px 8px">${r.reg ? (r.late ? `<span style="color:#9b6700;font-weight:700" title="Registo tardio">${r.reg} ⚠</span>` : r.reg) : "—"}</td>
            <td style="padding:6px 8px">${escape(r.num)}</td>
            <td style="padding:6px 8px">${r.descHtml}</td>
            <td style="padding:6px 8px">${escape(r.por)}</td>
            <td style="padding:6px 8px;text-align:center;white-space:nowrap">
              ${r.delId ? `<button class="secondary audit-del" data-i="${r.delId}" type="button" aria-label="Eliminar registo" title="Eliminar registo" style="min-height:0;padding:2px 8px">🗑</button>` : ""}
              ${r.reatId ? `<button class="secondary audit-reat" data-u="${r.reatId}" type="button" aria-label="Reativar operacional" title="Reativar operacional" style="min-height:0;padding:2px 8px">↺</button>` : ""}
            </td>
          </tr>`).join("") || `<tr><td colspan="6" style="padding:14px;text-align:center;color:var(--muted)">Sem registos.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
      <button id="auPrev" class="secondary" type="button" ${auditPage <= 1 ? "disabled" : ""}>Anterior</button>
      <span class="muted">Página ${auditPage} de ${pages}</span>
      <button id="auNext" class="secondary" type="button" ${auditPage >= pages ? "disabled" : ""}>Seguinte</button>
    </div>
    <h2 style="margin-top:26px">Backup</h2>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button id="bkExport" class="primary" type="button">📦 Exportar backup (JSON)</button>
      <button id="bkExportSql" class="primary" type="button">🗄️ Exportar backup (SQL p/ restore)</button>
    </div>
    <p class="muted" style="margin-top:6px">Gera um .json com todos os registos desde o início + perfis, manobras e teleférico (estado atual). Guarda-o em local seguro.</p>`;
};

export const renderCordasAuditoria = async () => {
  const turnos = await loadTurnos();
  state.turnos_cache = turnos;
  auditFilters.from = auditFilters.from || `${monthStr()}-01`;
  auditFilters.to = auditFilters.to || localDateKey();
  await Promise.all([loadAuditData(), loadAuditAlterations()]);
  renderAuditTable();
};

export const exportCordasAuditCSV = () => {
  const rows = buildAuditCombined(auditFilters.mode || "tudo");
  const L = [["Data", "Registado", "Numero", "Descricao", "Por"].map(v => `"${v}"`).join(",")];
  rows.forEach(r => L.push([r.data, r.reg || "", r.num, r.descRaw, r.por].map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(",")));
  const blob = new Blob(["\uFEFF" + L.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `auditoria_${auditFilters.from || monthStr()}.csv`;
  a.click(); URL.revokeObjectURL(url);
};

const fetchBackupData = async () => {
  const to = localDateKey();
  let all = []; let idx = 0;
  while (true) {
    const { data, error } = await db.from("registos")
      .select("id,user_id,manobra_id,realizado_em,posicao,criado_em,criado_por")
      .order("realizado_em", { ascending: true }).order("id", { ascending: true })
      .range(idx, idx + 999);
    if (error) throw new Error(error.message);
    all = all.concat(data || []);
    if ((data || []).length < 1000) break;
    idx += 1000;
  }
  const [pr, mv, om, tu, ex, ch, au] = await Promise.all([
    db.from("profiles").select("id,numero_operacional,nome,email,role,turno_id,ativo,so_teleferico,tele_posicao,curso_ra,curso_ru,curso_rt,criada_em,quartel,turno_origem,veio_cid,gestor"),
    db.from("manobras").select("id,nome,ativo,especial"),
    db.from("operacional_manobra").select("user_id,manobra_id,ativo"),
    db.from("turnos").select("id,nome,cor"),
    db.from("teleferico_externos").select("id,numero_operacional,nome,quartel,turno_origem,cid_turno,curso_ra,curso_ru,curso_rt,veio_cid,ativo,criada_em"),
    db.from("cursos_historico").select("id,user_id,tipo,data,criado_em,criado_por,nota"),
    db.from("auditoria").select("id,tabela,operacao,dados_antigos,dados_novos,user_id,user_numero,registo_id,criado_em").order("criado_em", { ascending: true })
  ]);
  if (pr.error || mv.error || om.error || tu.error || ex.error || ch.error || au.error) throw new Error("Erro ao ler dados para o backup.");
  return { to, registos: all, profiles: pr.data || [], manobras: mv.data || [], operacional_manobra: om.data || [],
           turnos: tu.data || [], teleferico_externos: ex.data || [], cursos_historico: ch.data || [], auditoria: au.data || [] };
};

const sqlQ = v => v === null || v === undefined ? "NULL"
  : typeof v === "number" ? String(v)
  : typeof v === "boolean" ? (v ? "true" : "false")
  : typeof v === "object" ? "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb"
  : "'" + String(v).replace(/'/g, "''") + "'";
const sqlSize = s => new Blob([s]).size;
const STMT_CAP = 50 * 1024, FILE_CAP = 300 * 1024;

const buildRestoreFiles = (bk) => {
  const tables = [
    ["turnos","public.turnos"], ["manobras","public.manobras"], ["profiles","public.profiles"],
    ["operacional_manobra","public.operacional_manobra"], ["teleferico_externos","public.teleferico_externos"],
    ["cursos_historico","public.cursos_historico"], ["auditoria","public.auditoria"], ["registos","public.registos"]
  ];
  const stmts = [];
  stmts.push("-- RSB · rsb_restore · gerado em " + new Date().toISOString() + "\n-- ⚠️ SÓ NUM PROJETO NOVO/VAZIO, após rsb_migracao.sql\n-- Desativar triggers durante o restore:");
  tables.forEach(([k,t]) => stmts.push("alter table " + t + " disable trigger all;"));
  tables.forEach(([key, table]) => {
    const rows = bk[key] || [];
    if (!rows.length) { stmts.push("-- " + table + ": 0 linhas"); return; }
    const cols = [];
    rows.forEach(r => Object.keys(r).forEach(c => { if (!cols.includes(c)) cols.push(c); }));
    stmts.push("-- " + table + ": " + rows.length + " linhas");
    let cur = null, curSize = 0;
    const flush = () => { if (cur) { stmts.push(cur + ";"); cur = null; curSize = 0; } };
    rows.forEach(r => {
      const vals = "(" + cols.map(c => sqlQ(r[c] !== undefined ? r[c] : null)).join(", ") + ")";
      if (!cur) { cur = "insert into " + table + " (" + cols.join(", ") + ") values\n" + vals; curSize = sqlSize(cur); }
      else if (curSize + vals.length + 2 > STMT_CAP) { flush(); cur = "insert into " + table + " (" + cols.join(", ") + ") values\n" + vals; curSize = sqlSize(cur); }
      else { cur += ",\n" + vals; curSize += vals.length + 2; }
    });
    flush();
  });
  stmts.push("-- Repor sequências");
  ["turnos","registos","auditoria","cursos_historico"].forEach(t =>
    stmts.push("select setval(pg_get_serial_sequence('public." + t + "','id'), coalesce(max(id),1)) from public." + t + ";"));
  stmts.push("-- Reativar triggers");
  tables.forEach(([k,t]) => stmts.push("alter table " + t + " enable trigger all;"));
  stmts.push("-- (Opcional) Reassociar o Chefe das Cordas a um login novo:\n-- update public.profiles set id = '<UUID_NOVO>' where email = '<email@cm-lisboa.pt>';");
  const files = [[]]; let fSize = 0;
  stmts.forEach(s => {
    const sz = sqlSize(s) + 1;
    if (fSize + sz > FILE_CAP && files[files.length-1].length) { files.push([]); fSize = 0; }
    files[files.length-1].push(s); fSize += sz;
  });
  return files.map(f => f.join("\n"));
};

const downloadFiles = async (contents, base) => {
  for (let i = 0; i < contents.length; i++) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([contents[i]], {type:"text/plain"}));
    a.download = contents.length === 1 ? base + ".sql" : base + "_" + String(i+1).padStart(2,"0") + ".sql";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    await new Promise(r => setTimeout(r, 700));
  }
};

export const exportBackupJSON = async () => {
  try {
    const bk = await fetchBackupData();
    const backup = {
      meta: { app: "RSB — Resgate por Cordas", gerado_em: new Date().toISOString(), periodo: { de: "início", ate: bk.to },
        contagens: { registos: bk.registos.length, profiles: bk.profiles.length, manobras: bk.manobras.length,
          teleférico: bk.operacional_manobra.length, externos: bk.teleferico_externos.length,
          cursos_historico: bk.cursos_historico.length, auditoria: bk.auditoria.length } },
      turnos: bk.turnos, manobras: bk.manobras, profiles: bk.profiles, operacional_manobra: bk.operacional_manobra,
      teleferico_externos: bk.teleferico_externos, cursos_historico: bk.cursos_historico, auditoria: bk.auditoria, registos: bk.registos
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "backup_cid_" + bk.to + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Backup JSON exportado (" + bk.registos.length + " registos, " + bk.cursos_historico.length + " cursos).", "ok", 5000);
  } catch (e) { toast("Erro ao exportar backup: " + e.message, "err", 6000); }
};

export const exportBackupSQL = async () => {
  try {
    const bk = await fetchBackupData();
    const files = buildRestoreFiles(bk);
    await downloadFiles(files, "rsb_restore");
    toast("Backup SQL gerado em " + files.length + " ficheiro(s). Corre por ordem num projeto vazio.", "ok", 6000);
  } catch (e) { toast("Erro ao gerar backup SQL: " + e.message, "err", 6000); }
};

document.addEventListener("click", (e) => {
  if (e.target.closest("#bkExportSql")) exportBackupSQL();
});

export const applyAuditFilters = async (from, to, turno, move, num) => {
  auditFilters.from = from || auditFilters.from;
  auditFilters.to = to || auditFilters.to;
  auditFilters.turno = turno || "";
  auditFilters.move = move || "";
  auditFilters.num = (num || "").trim();
  auditPage = 1;
  await Promise.all([loadAuditData(), loadAuditAlterations()]);
  renderAuditTable();
};
export const auditPager = (delta) => { auditPage += delta; renderAuditTable(); };

export const printReport = () => {
  let pa = document.getElementById("printArea");
  if (!pa) { pa = document.createElement("div"); pa.id = "printArea"; document.body.appendChild(pa); }
  pa.innerHTML = lastReportHTML;
  // esconde a preview antes de imprimir (evita duplicar)
  const out = $("rpOut"); const saved = out ? out.style.display : "";
  if (out) out.style.display = "none";
  window.print();
  // restaura depois
  setTimeout(() => { if (out) out.style.display = saved; pa.innerHTML = ""; }, 500);
};

const fetchAllRegistos = async () => {
  let from = 0, all = [];
  while (true) {
    const { data, error } = await db.from("registos").select("user_id,manobra_id,realizado_em").range(from, from + 999);
    if (error) throw error;
    all = all.concat(data || []);
    if ((data || []).length < 1000) break;
    from += 1000;
  }
  return all;
};
const ymOf = (k) => [Number(k.slice(0, 4)), Number(k.slice(5, 7))];
const statusAt = (dateKey, cutKey) => {
  const [y, m] = ymOf(dateKey), [cy, cm] = ymOf(cutKey);
  const dd = Number(dateKey.slice(8, 10)), cd = Number(cutKey.slice(8, 10));
  let d = (cy - y) * 12 + (cm - m);
  if (cd < dd) d--;
  return d <= 2 ? "g" : d <= 5 ? "y" : d <= 8 ? "r" : "k";
};
const colorOf = (pct) => pct >= 75 ? "g" : pct >= 50 ? "y" : pct >= 25 ? "r" : "k";
const TURNOS_COLORS = ["#1261a0", "#177245", "#9b6700", "#c62032"];

const lineChart = (series, labels) => {
  const W = 560, H = 220, P = 30, n = labels.length;
  const x = i => P + i * (W - 2 * P) / Math.max(1, n - 1);
  const y = v => H - P - (v / 100) * (H - 2 * P);
  let grid = "";
  [0, 25, 50, 75, 100].forEach(g => { grid += `<line x1="${P}" y1="${y(g)}" x2="${W-P}" y2="${y(g)}" stroke="#eee"/><text x="${P-6}" y="${y(g)+3}" font-size="9" fill="#999" text-anchor="end">${g}</text>`; });
  const step = Math.ceil(n / 6);
  const xlab = labels.map((l, i) => i % step === 0 ? `<text x="${x(i)}" y="${H-8}" font-size="9" fill="#999" text-anchor="middle">${l}</text>` : "").join("");
  const lines = series.map(s => `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}"/>`).join("");
  const legend = series.map(s => `<span style="margin-right:10px"><i style="display:inline-block;width:10px;height:10px;background:${s.color};border-radius:2px"></i> ${escape(s.name)}</span>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${grid}${lines}${xlab}</svg><div style="font-size:.75rem">${legend}</div>`;
};

export const buildCommandReport = async (mode, month, year) => {
  await loadMoves();
  await Promise.all([loadPeople(), loadLatestAll(), loadSpecialAssignments()]);
  const turnos = await loadTurnos();
  const ops = state.people.filter(p => p.ativo && p.role !== "chefe_cordas");
  const normMoves = state.moves.filter(m => !isSpecialMove(m));
  const teleMove = state.moves.find(m => isSpecialMove(m));
  const allRegs = await fetchAllRegistos();

  // VARP = nº de operacionais pela cor da sua média individual
  const per = turnos.map(t => {
    const people = ops.filter(p => p.turno_id === t.id);
    const varp = { g: 0, y: 0, r: 0, k: 0 };
    people.forEach(p => varp[colorOf(metricsForPeople([p]).pct)]++);
    return { t, people, m: metricsForPeople(people), varp };
  });
  const company = Math.round(per.reduce((s, x) => s + x.m.pct, 0) / (per.length || 1));
  const tot = per.reduce((a, x) => ({ g: a.g + x.m.g, total: a.total + x.m.total }), { g: 0, total: 0 });
  const pctGreen = tot.total ? Math.round(tot.g / tot.total * 100) : 0;

  const from = mode === "mensal" ? `${month}-01` : `${year}-01-01`;
  const to = mode === "mensal" ? `${month}-31` : `${year}-12-31`;
  const turnoOf = {}; ops.forEach(p => turnoOf[p.id] = p.turno_id);
  const actByTurno = {}; turnos.forEach(t => actByTurno[t.id] = 0);
  const inPeriod = allRegs.filter(r => r.realizado_em >= from && r.realizado_em <= to);
  inPeriod.forEach(r => { if (actByTurno[turnoOf[r.user_id]] != null) actByTurno[turnoOf[r.user_id]]++; });
  const totalAct = inPeriod.filter(r => turnoOf[r.user_id] != null).length;

  const risk = normMoves.map(m => {
    let bad = 0;
    ops.filter(p => !p.so_teleferico).forEach(p => {
      const [s] = estadoFromRecord(state.latestAll.get(pairKey(p.id, m.id)));
      if (s === "r" || s === "k") bad++;
    });
    return { m, bad };
  }).filter(x => x.bad > 0).sort((a, b) => b.bad - a.bad).slice(0, 5);

  // Operacionais em risco (média individual vermelha/preta)
  const risco = ops.map(p => ({ p, pct: metricsForPeople([p]).pct }))
    .filter(x => x.pct < 50).sort((a, b) => a.pct - b.pct);

  const telePer = turnos.map(t => {
    const tp = ops.filter(p => p.turno_id === t.id && state.specialAssignments.has(String(p.id)));
    const varp = { g: 0, y: 0, r: 0, k: 0 }; let sum = 0, n = 0;
    if (teleMove) tp.forEach(p => {
      const dt = state.latestAll.get(pairKey(p.id, teleMove.id));
      const [s] = estadoFromRecord(dt);
      varp[s]++; n++; sum += pairScore(s, !!dt && !isFutureRecord(dt));
    });
    return { t, count: tp.length, pct: n ? Math.round(sum / n) : 0, varp };
  });

  // Histórico para o gráfico de tendência
  const pairDates = new Map();
  allRegs.forEach(r => {
    const k = pairKey(r.user_id, r.manobra_id);
    if (!pairDates.has(k)) pairDates.set(k, []);
    pairDates.get(k).push(r.realizado_em);
  });
  pairDates.forEach(a => a.sort());
  const readinessAt = (cut) => {
    const acc = {}; turnos.forEach(t => acc[t.id] = { s: 0, n: 0 });
    ops.forEach(p => {
      const b = acc[p.turno_id]; if (!b) return;
      applicableMovesFor(p).forEach(mv => {
        const ds = pairDates.get(pairKey(p.id, mv.id));
        let last = null;
        if (ds) for (let i = ds.length - 1; i >= 0; i--) { if (ds[i] <= cut) { last = ds[i]; break; } }
        b.n++; b.s += last ? { g: 100, y: 75, r: 50, k: 25 }[statusAt(last, cut)] : 0;
      });
    });
    const out = {}; turnos.forEach(t => out[t.id] = acc[t.id].n ? Math.round(acc[t.id].s / acc[t.id].n) : 0);
    return out;
  };
  const cutoffs = [];
  if (mode === "mensal") {
    const [sy, sm] = month.split("-").map(Number);
    for (let k = 11; k >= 0; k--) {
      let mm = sm - k, yy = sy; while (mm < 1) { mm += 12; yy--; }
      const ld = new Date(yy, mm, 0).getDate();
      cutoffs.push({ key: `${yy}-${String(mm).padStart(2, "0")}-${String(ld).padStart(2, "0")}`, label: `${String(mm).padStart(2, "0")}/${String(yy).slice(2)}` });
    }
  } else {
    for (let k = 4; k >= 0; k--) { const yy = year - k; cutoffs.push({ key: `${yy}-12-31`, label: String(yy) }); }
  }
  const hist = cutoffs.map(c => readinessAt(c.key));
  const series = turnos.map((t, i) => ({ name: t.nome, color: TURNOS_COLORS[i % 4], values: hist.map(h => h[t.id]) }));

  const periodLabel = mode === "mensal" ? `Mês ${month}` : `Ano ${year}`;
  const chefe = (state.profile?.nome || "").trim() || ("nº " + (state.profile?.numero_operacional || ""));
  const kpi = (l, v) => `<div style="flex:1;border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center"><strong style="font-size:20px">${v}</strong><br><small>${l}</small></div>`;
  const varpCells = v => `<td style="text-align:center;color:#177245">${v.g}</td><td style="text-align:center;color:#9b6700">${v.y}</td><td style="text-align:center;color:#c62032">${v.r}</td><td style="text-align:center;color:#111">${v.k}</td>`;
  const riscoCol = { r: "#c62032", k: "#111" };

  lastReportHTML = `
  <div style="font-family:system-ui;color:#111;padding:8px">
    <div style="background:#0b2540;color:#fff;padding:14px;border-radius:8px">
      <strong style="font-size:16px">Relatório de Prontidão — Resgate por Cordas</strong><br>
      <small>${periodLabel} · Emitido em ${new Date().toLocaleDateString("pt-PT")} · Chefe das Cordas: ${escape(chefe)}</small>
    </div>
    <div style="display:flex;gap:10px;margin:12px 0">${kpi("Prontidão", company + "%")}${kpi("Operacionais", ops.length)}${kpi("Manobras no período", totalAct)}${kpi("Em verde", pctGreen + "%")}</div>

    <h3>Prontidão por turno</h3>
    <table style="width:100%;border-collapse:collapse" border="0">
      <tr style="background:#eef2f7"><th style="text-align:left;padding:6px">Turno</th><th>Prontidão</th><th>Operacionais</th><th>V</th><th>A</th><th>R</th><th>P</th></tr>
      ${per.map(x => `<tr><td style="padding:6px;border-top:1px solid #eee">${escape(x.t.nome)}</td><td style="text-align:center">${x.m.pct}%</td><td style="text-align:center">${x.people.length}</td>${varpCells(x.varp)}</tr>`).join("")}
    </table>
    <small style="color:#666">V/A/R/P = nº de operacionais pela cor da sua média individual.</small>

    <h3>Tendência de prontidão (${mode === "mensal" ? "últimos 12 meses" : "últimos 5 anos"})</h3>
    ${lineChart(series, cutoffs.map(c => c.label))}

    <h3>Manobras em risco (top 5)</h3>
    ${risk.map(x => `<div style="margin:4px 0"><div style="display:flex;justify-content:space-between"><span>${escape(x.m.nome)}</span><strong>${x.bad}</strong></div><div style="height:6px;background:#eee;border-radius:3px"><div style="height:6px;width:${Math.min(100, x.bad * 10)}%;background:#c62032;border-radius:3px"></div></div></div>`).join("") || '<p>Sem manobras em risco.</p>'}

    <h3>Operacionais em risco</h3>
    <p>${risco.map(x => `<span style="display:inline-block;border:1px solid ${riscoCol[colorOf(x.pct)]};color:${riscoCol[colorOf(x.pct)]};border-radius:12px;padding:2px 8px;margin:2px">${escape(x.p.numero_operacional)} · ${x.p.externo ? "EXT" : "T" + x.p.turno_id}</span>`).join("") || "Nenhum."}</p>

    <h3>Prontidão Teleférico</h3>
    <table style="width:100%;border-collapse:collapse" border="0">
      <tr style="background:#eef2f7"><th style="text-align:left;padding:6px">Turno</th><th>Prontidão</th><th>Op. Teleférico</th><th>V</th><th>A</th><th>R</th><th>P</th></tr>
      ${telePer.map(x => `<tr><td style="padding:6px;border-top:1px solid #eee">${escape(x.t.nome)}</td><td style="text-align:center">${x.pct}%</td><td style="text-align:center">${x.count}</td>${varpCells(x.varp)}</tr>`).join("")}
    </table>
    <small style="color:#666">V/A/R/P = nº de operacionais de teleférico em cada cor.</small>

    <h3>Atividade no período (por turno)</h3>
    <p>${turnos.map(t => `${escape(t.nome)}: <strong>${actByTurno[t.id]}</strong>`).join(" · ")}</p>

    <h3>Observações</h3>
    <div style="border:1px solid #ddd;border-radius:8px;min-height:60px;padding:8px"></div>
    <p style="margin-top:30px">_____________________________<br>O Chefe das Cordas</p>
  </div>`;
  return lastReportHTML;
};

export const loadTelePosData = async (teleMoveId) => {
  const { data } = await db.from("registos")
    .select("user_id,posicao,realizado_em")
    .eq("manobra_id", teleMoveId)
    .order("realizado_em", { ascending: false });
  const map = new Map();
  (data || []).forEach(r => {
    const key = `${r.user_id}-${r.posicao}`;
    if (!map.has(key)) map.set(key, r.realizado_em);
  });
  state.telePosData = map;
};

export const renderCordasTurnos = async () => {
  state.fichaUser = null;
  const box = $("tu");
  box.innerHTML = skList(3, 60);
  await Promise.all([loadPeople(), loadMoves(), loadLatestAll(), loadSpecialAssignments()]);
  const turnos = await loadTurnos();
  await loadExternos();

  // ====== Validade dos cursos (RU · RA) ======
  const val = [];
  state.people.filter(p => p.ativo && p.role !== "chefe_cordas").forEach(p => {
    if (p.curso_ra) val.push({ p, lab: "RA", d: p.curso_ra });
    if (p.curso_ru && !p.curso_ra) val.push({ p, lab: "RU", d: p.curso_ru }); // RA protege RU
  });
  val.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  // ====== Externos: RT à vista, resto expandido ======
  const extAll = state.people.filter(p => p.ativo && p.role === "externo" && !p.turno_id);
  const extRT = extAll.filter(p => p.curso_rt);
  const extRest = extAll.filter(p => !p.curso_rt);
    const extCard = (p) => {
    const bd = teleBadge(p);
    return `<button class="ficha-btn" data-u="${p.id}" type="button" style="position:relative;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:40px;padding:5px 2px;border-radius:8px;border:1px solid var(--blue);background:var(--blue-soft);color:var(--navy);font-weight:800;font-size:.85rem;line-height:1">
      <span>${escape(p.numero_operacional || "—")}</span>
      <span style="color:#1261a0;font-size:.55rem;font-weight:800">${extTag(p)}</span>
      ${bd ? `<span style="position:absolute;top:2px;right:4px;color:#1261a0;font-size:.55rem;line-height:1;font-weight:800;letter-spacing:.5px" title="${bd.d}">${bd.t}</span>` : ""}
    </button>`;
  };

  // ====== HTML principal ======
  box.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">
      ${turnos.map(t => {
        const people = state.people.filter(p => p.ativo && p.turno_id === t.id && p.role !== "chefe_cordas")
          .sort((a, b) => (a.numero_operacional || "").localeCompare(b.numero_operacional || "", undefined, { numeric: true }));
        const m = metricsForPeople(people);
        return `<div style="border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--white);box-shadow:var(--shadow-soft);display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:0 0 72px">
            ${ringWithBadge(m.pct, 56, 6, t.nome)}
          </div>
          <div style="flex:1;min-width:200px;display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:5px;align-content:start">
            ${people.map(p => {
              const app = applicableMovesFor(p);
              const mediaMonths = app.length ? Math.round(app.reduce((acc, mv) => acc + monthsForRecord(state.latestAll.get(pairKey(p.id, mv.id))), 0) / app.length) : NO_RECORD_MONTHS;
              const st = estadoFromMonths(mediaMonths)[0];
              const cs = { g: { bg: "#e7f2ec", bd: "#177245" }, y: { bg: "#f7f0e0", bd: "#9b6700" }, r: { bg: "#f9e9eb", bd: "#c62032" }, k: { bg: "#ededed", bd: "#111" } }[st];
              const bd = teleBadge(p);
              return `<button class="ficha-btn" data-u="${p.id}" type="button" style="position:relative;cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:40px;padding:6px 2px;border-radius:8px;border:1px solid ${cs.bd};background:${cs.bg};color:${cs.bd};font-weight:800;font-size:.85rem;line-height:1;box-shadow:none">
                <span>${escape(p.numero_operacional || "—")}</span>
                ${p.role === "chefe_turno" ? `<span style="position:absolute;top:2px;left:4px;color:#d4a017;font-size:.62rem;line-height:1" title="Chefe de turno">★</span>` : ""}
                ${bd ? `<span style="position:absolute;top:2px;right:4px;color:#1261a0;font-size:.55rem;line-height:1;font-weight:800;letter-spacing:.5px" title="${bd.d}">${bd.t}</span>` : ""}
              </button>`;
            }).join("") || '<p class="empty">Sem operacionais.</p>'}
          </div>
        </div>`;
      }).join("")}
    </div>

       <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:22px 0 8px">
      <h3 style="margin:0">Externos</h3>
      ${extRest.length ? `<button id="extToggle" data-total="${extAll.length}" class="secondary" type="button" style="min-height:32px;padding:6px 12px;font-size:.72rem">Mostrar todos (${extAll.length})</button>` : ""}
    </div>
    <div style="border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--white);box-shadow:var(--shadow-soft)">
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:5px">
        ${extRT.map(extCard).join("") || '<p class="empty">Sem externos com RT.</p>'}
      </div>
      ${extRest.length ? `
      <div id="extRest" class="hide" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(56px,1fr));gap:5px;margin-top:10px">
        ${extRest.map(extCard).join("")}
      </div>` : ""}
    </div>

    ${val.length ? `
    <h3 style="margin:22px 0 8px">Validade dos cursos RU · RA</h3>
    <div style="border:1px solid var(--line);border-top:4px solid var(--navy);border-radius:12px;padding:14px;background:var(--white);box-shadow:var(--shadow-soft)">
      <p style="margin:0 0 10px;font-size:.78rem;color:var(--muted);font-weight:700">
        16 mais antigos · <span style="color:#111">■</span> caducado · <span style="color:#c62032">■</span> ≤1 ano · <span style="color:#9b6700">■</span> ≤2 anos · <span style="color:#177245">■</span> &gt;2 anos
      </p>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px">
        ${val.slice(0, 16).map(valChip).join("")}
      </div>
    </div>
    ` : ""}

    <h3 style="margin:22px 0 8px">Adicionar operacional</h3>
    <div style="border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--white);box-shadow:var(--shadow-soft)">
      <div class="field"><label>Número operacional<input id="opNum" inputmode="numeric" maxlength="4"></label></div>
      <div class="field"><label>Turno</label>
        <div style="display:flex;align-items:center;gap:10px">
          <select id="opTurno" style="flex:1"><option value="">Selecionar turno</option>${turnos.map(t => `<option value="${t.id}">${escape(t.nome)}</option>`).join("")}</select>
          <label style="display:inline-flex;align-items:center;gap:5px;font-size:.74rem;font-weight:700;color:var(--navy);cursor:pointer;white-space:nowrap"><input type="checkbox" id="opExt" style="width:16px;height:16px;min-width:16px;min-height:16px;margin:0;accent-color:var(--red)"> externo</label>
        </div>
      </div>
      <div class="field hide" id="opQuartelWrap"><label>Quartel<input id="opQuartel" type="text" placeholder="Quartel de origem"></label></div>
      <div class="field"><label>E-mail<input id="opEmail" type="email" placeholder="nome.sobrenome@cm-lisboa.pt"></label></div>
      <button id="opAdd" class="primary" type="button">+ Registar operacional</button>
    </div>
    <div id="tum" class="msg" role="alert"></div>`;

  startRings(box);
};

const recDate = (dt) => dt ? (dt.realizado_em || (typeof dt === "string" ? dt : null)) : null;

const renderCursoHistModal = () => {
  const uid = state.fichaCursoUid;
  const tipo = state.fichaCursoKey.replace("curso_", "");
  const hist = ordenaHistorico(state.cursosHist?.get(String(uid))?.filter(h => h.tipo === tipo) || []);
  const ativo = cursoAtivo(hist);
  $("cursoHistAtivoData").textContent = ativo ? formatDate(ativo) : "— sem data —";
  const col = ativo ? cursoCor(ativo) : { bg: "#ededed", bd: "#617383" };
  $("cursoHistAtivo").style.background = col.bg;
  $("cursoHistAtivo").style.borderColor = col.bd;
  const estado = ativo ? (4*365 - (new Date() - new Date(ativo))/86400000) : null;
  const estadoTxt = estado === null ? "" : estado < 0 ? "caducado" : estado <= 365 ? "caduca em ≤1 ano" : estado <= 730 ? "caduca em ≤2 anos" : "válido";
  $("cursoHistAtivoEstado").innerHTML = ativo ? `<span style="color:${col.bd}">${estadoTxt}</span>` : "";
  $("cursoHistEdit").disabled = !ativo;
  $("cursoHistDel").disabled = !ativo;
  $("cursoHistList").innerHTML = hist.length
    ? hist.map((h, i) => `<div class="curso-hist-item${i === 0 ? " ativo" : ""}">
        <span>${formatDate(h.data)}${h.nota ? ` · ${escape(h.nota)}` : ""}</span>
        <small>${i === 0 ? "ativa" : (i === hist.length - 1 ? "1.º curso" : "revalidação")}</small>
      </div>`).join("")
    : '<p class="empty">Sem histórico.</p>';
  $("cursoHistAddLabel").textContent = hist.length ? "Nova Revalidação" : "Curso Inicial";
  $("cursoHistAdd").textContent = hist.length ? "+ Adicionar Revalidação" : "+ Registar curso";
  const lim = cursoLimites(uid, tipo, "add");
  const inp = $("cursoHistNovo");
  inp.min = lim.min || "";
  inp.max = lim.max || localDateKey();
  inp.value = "";
};

export const loadCursoHist = async (uid) => {
  if (!state.cursosHist) state.cursosHist = new Map();
  const { data, error } = await db.from("cursos_historico")
    .select("id,tipo,data,nota,criado_em")
    .eq("user_id", uid)
    .order("data", { ascending: false });
  state.cursosHist.set(String(uid), error ? [] : (data || []));
};

const cursoDateModal = (current, min, max) => new Promise(resolve => {
  const modal = $("cursoModal"); const input = $("cursoModalInput");
  $("cursoModalTitle").textContent = "Editar data do curso";
  modal.style.zIndex = "1250";
  input.min = min || "";
  input.max = max || localDateKey();
  input.value = current || "";
  const done = (v) => { modal.classList.add("hide"); resolve(v); };
  $("cursoModalOk").onclick = () => done(input.value);
  $("cursoModalClose").onclick = () => done(undefined);
  modal.onclick = (e) => { if (e.target === modal) done(undefined); };
  modal.classList.remove("hide");
  setTimeout(() => input.focus(), 50);
});

export const openCursoHist = async (uid, key) => {
  state.fichaCursoKey = key;
  state.fichaCursoUid = uid;
  const tipo = key.replace("curso_", "");
  const p = state.people.find(x => String(x.id) === String(uid));
  $("cursoHistTitle").textContent = `nº ${p?.numero_operacional || "—"} · Curso ${tipo.toUpperCase()}`;
  $("cursoHistMsg").className = "msg"; $("cursoHistMsg").textContent = "";
  await loadCursoHist(uid);
  renderCursoHistModal();
  $("cursoHistModal").classList.remove("hide");
  $("cursoHistModal").style.zIndex = "1150";
  document.body.style.overflow = "hidden";
};

const cursoLimites = (uid, tipo, mode) => {
  const all = state.cursosHist?.get(String(uid)) || [];
  const hist = ordenaHistorico(all.filter(h => h.tipo === tipo));
  const ativo = hist[0]?.data || null;
  const anterior = hist[1]?.data || null;
  const de = (t) => cursoAtivo(all.filter(h => h.tipo === t));
  const ru = de("ru");
  const caps = [de("ra"), de("rt")].filter(Boolean).sort();
  let min, max;
  if (tipo === "ru") {
    min = mode === "add" ? ativo : anterior;
    max = caps.length ? caps[0] : null;
  } else {
    min = mode === "add" ? (ativo || ru) : (anterior || ru);
    max = null;
  }
  return { min, max };
};

export const bindCursoHistModal = () => {
  const close = () => { $("cursoHistModal").classList.add("hide"); document.body.style.overflow = ""; };
  $("cursoHistClose").onclick = close;
  $("cursoHistModal").onclick = (e) => { if (e.target === $("cursoHistModal")) close(); };

  const histDe = (uid, tipo) => ordenaHistorico((state.cursosHist?.get(String(uid)) || []).filter(h => h.tipo === tipo));
  const ativoDe = (uid, tipo) => cursoAtivo(histDe(uid, tipo));

  const validaData = (tipo, data, uid) => {
    const p = state.people.find(x => String(x.id) === String(uid));
    const ru = ativoDe(uid, "ru"), ra = ativoDe(uid, "ra"), rt = ativoDe(uid, "rt");
    if (tipo === "ru") {
      if (ra && data > ra) return `O RU não pode ficar posterior ao RA (${formatDate(ra)}).`;
      if (rt && data > rt) return `O RU não pode ficar posterior ao RT (${formatDate(rt)}).`;
    } else {
      if (!p?.curso_ru && !histDe(uid, tipo).length) return "Regista primeiro o curso RU — RA e RT exigem RU.";
      if (ru && data < ru) return `A data não pode ser anterior ao RU (${formatDate(ru)}).`;
    }
    if (data > localDateKey()) return "A data não pode ser futura.";
    const ativo = ativoDe(uid, tipo);
    if (ativo && data === ativo) return "Já existe uma revalidação nesta data — usa Editar para a corrigir.";
    if (ativo && data < ativo) return `A data não pode ser anterior à última revalidação (${formatDate(ativo)}).`;
    return null;
  };

  // ===== Helper: esconde o histórico enquanto corre outra ação (ex.: password) =====
  const withHistClosed = async (fn) => {
    $("cursoHistModal").classList.add("hide");
    document.body.style.overflow = "";
    let result;
    try { result = await fn(); }
    finally {
      // Recarrega a lista e reabre o histórico
    await loadCursoHist(state.fichaCursoUid);
    invalidatePeople();
    if (panelVisible("tu") && state.fichaUser) await renderOperacionalFicha(state.fichaUser);
    else if (panelVisible("tu")) await renderCordasTurnos();
    else if (panelVisible("ov")) await renderOverview();
      renderCursoHistModal();
      $("cursoHistModal").classList.remove("hide");
      $("cursoHistModal").style.zIndex = "1150";
      document.body.style.overflow = "hidden";
    }
    return result;
  };

  $("cursoHistAdd").onclick = async () => {
    const uid = state.fichaCursoUid, tipo = state.fichaCursoKey.replace("curso_", "");
    const data = $("cursoHistNovo").value;
    if (!data) return M("cursoHistMsg", "Escolhe uma data.", "e");
    const err = validaData(tipo, data, uid);
    if (err) return M("cursoHistMsg", err, "e");
    const first = !histDe(uid, tipo).length;
    await withHistClosed(async () => {
      const ok = await openPasswordConfirm(first ? "Curso Inicial" : "Nova Revalidação",
        `${first ? "Registar Curso Inicial" : "Adicionar Revalidação"} ${tipo.toUpperCase()} = ${formatDate(data)}?`,
        first ? "Registar" : "Adicionar");
      if (!ok) return;
      const { error } = await db.rpc("fn_add_curso", { p_uid: uid, p_tipo: tipo, p_data: data });
      if (error) { toast(error.message, "err"); return; }
      toast(first ? `Curso ${tipo.toUpperCase()} registado.` : `Curso ${tipo.toUpperCase()} revalidado.`, "ok");
    });
    M("cursoHistMsg", "Histórico atualizado.", "ok");
  };

  $("cursoHistEdit").onclick = async () => {
    const uid = state.fichaCursoUid, tipo = state.fichaCursoKey.replace("curso_", "");
    const hist = histDe(uid, tipo);
    const atual = cursoAtivo(hist);
    const lim = cursoLimites(uid, tipo, "edit");
    const nova = await cursoDateModal(atual, lim.min, lim.max);
    if (!nova || nova === atual) return;
    if (lim.min && nova < lim.min) return toast(`A data não pode ser anterior a ${formatDate(lim.min)}.`, "err");
    if (lim.max && nova > lim.max) return toast(`A data não pode ser posterior a ${formatDate(lim.max)}.`, "err");
    if (nova > localDateKey()) return toast("A data não pode ser futura.", "err");
    await withHistClosed(async () => {
      const ok = await openPasswordConfirm("Editar data ativa", `Alterar ${tipo.toUpperCase()} de ${formatDate(atual)} para ${formatDate(nova)}?`, "Editar");
      if (!ok) return;
      const { error } = await db.from("cursos_historico").update({ data: nova }).eq("id", hist[0].id);
      if (error) { toast(error.message, "err"); return; }
      toast(`Curso ${tipo.toUpperCase()} atualizado.`, "ok");
    });
  };

  $("cursoHistDel").onclick = async () => {
    const uid = state.fichaCursoUid, tipo = state.fichaCursoKey.replace("curso_", "");
    const hist = histDe(uid, tipo);
    if (!hist.length) return;
    if (tipo === "ru" && (ativoDe(uid, "ra") || ativoDe(uid, "rt")))
      return toast("O RU não pode ser eliminado enquanto existir RA ou RT.", "err");
    const msg = hist.length > 1
      ? `Eliminar a revalidação de ${formatDate(hist[0].data)}? A data ${formatDate(hist[1].data)} volta a ficar ativa.`
      : `Eliminar a data ${formatDate(hist[0].data)}? O curso ficará sem data.`;
    await withHistClosed(async () => {
      const ok = await openPasswordConfirm("Eliminar revalidação", msg, "Eliminar");
      if (!ok) return;
      const { error } = await db.rpc("fn_del_curso", { p_uid: uid, p_tipo: tipo });
      if (error) { toast(error.message, "err"); return; }
      toast(hist.length > 1 ? `Revalidação eliminada — ${formatDate(hist[1].data)} volta a ativa.` : "Curso eliminado.", "ok");
    });
  };
};
bindCursoHistModal();

export const renderOperacionalFicha = async (uid) => {
state.fichaUser = uid;
const box = $("tu");
box.innerHTML = skList(3, 60);
await Promise.all([loadPeople(), loadMoves(), loadLatestAll(), loadSpecialAssignments()]);
const turnos = await loadTurnos();
await loadExternos();
const p = state.people.find(x => String(x.id) === String(uid));
if (!p) return renderCordasTurnos();
const teleMove = state.moves.find(m => isSpecialMove(m));
if (teleMove) await loadTelePosData(teleMove.id);
await loadCursoHist(uid);
const nome = nomeFromEmail(p.email) || p.nome || "";
const moves = state.moves.filter(m => !isSpecialMove(m) && !p.so_teleferico);
const rows = moves.map(m => {
  const dt = state.latestAll.get(pairKey(p.id, m.id));
  const [s, dot] = estadoFromRecord(dt);
  const days = daysForRecord(dt);
  const label = !dt ? "-" : (isFutureRecord(dt) ? "—" : `${days}d`);
  return `<article class="mini status-${s}"><strong>${escape(m.nome)}</strong><span><i class="dot ${dot}"></i>${label}</span></article>`;
}).join("");
const curso = (label, key, raPreenchido, requerRU) => {
  const hist = state.cursosHist?.get(String(state.fichaUser))?.filter(h => h.tipo === key.replace("curso_", "")) || [];
  const d = cursoAtivo(hist);
  const col = cursoCor(d || "1900-01-01").bd;
  const raProtege = label === "RU" && raPreenchido;
  const finalCol = raProtege ? "#177245" : (d ? col : "#617383");
  const count = hist.length;
  return `<button type="button" class="curso-btn" data-c="${key}" style="border:1px solid ${finalCol};border-radius:10px;padding:8px;text-align:center;background:var(--white);cursor:pointer;min-height:0;position:relative">
    <strong>${label}</strong>
    ${count > 1 ? `<span style="position:absolute;top:4px;right:6px;font-size:.6rem;font-weight:800;color:var(--muted);background:var(--blue-pale);padding:1px 5px;border-radius:6px">${count}</span>` : ""}
    <div style="font-size:.75rem;color:${finalCol};font-weight:700;margin-top:6px">${d ? formatDate(d) : "— · tocar para definir"}</div>
    ${requerRU ? '<div style="font-size:.62rem;color:#9b6700;font-weight:700;margin-top:4px">Requer RU</div>' : ""}
  </button>`;
};
const isExterno = p.role === "externo";
const extAtivo = isExterno && !p.turno_id;
const isTelef = state.specialAssignments.has(String(p.id));
const teleCol = CORES[estadoFromMonths(teleOverallMonths(p.id))[0]];
const soTelef = !!p.so_teleferico;
const mi = 'class="secondary" type="button" style="min-height:0;padding:8px 12px;width:100%;text-align:left;justify-content:flex-start;font-size:.82rem;font-weight:700"';
box.innerHTML = `
<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
  <button id="fichaBack" class="secondary" type="button">← Voltar</button>
  <div style="position:relative">
    <button id="fichaMenuBtn" class="secondary" type="button" aria-label="Ações" title="Ações" style="width:44px;height:44px;min-width:44px;min-height:44px;padding:0;display:inline-flex;align-items:center;justify-content:center">${MENU}</button>
    <div id="fichaMenu" class="hide" style="position:absolute;right:0;top:calc(100% + 6px);z-index:1100;min-width:200px;background:var(--white);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow-soft);padding:6px;display:flex;flex-direction:column;gap:4px">
      ${isExterno ? `
        <button id="fichaOrigem" ${mi}>Turno</button>
        <button id="fichaNum" ${mi}>Alterar número</button>
        <button id="fichaLink" ${mi}>Reenviar link</button>
        ${p.turno_id
          ? `<button id="fichaRemoverCID" ${mi}>Remover da CID</button>`
          : `<button id="fichaImport" ${mi}>Importar para a CID</button>`}
        <button id="fichaDesat" class="secondary mi-danger" type="button" style="min-height:0;padding:8px 12px;width:100%;text-align:left;justify-content:flex-start;font-size:.82rem;font-weight:700">Desativar</button>
      ` : `
        <button id="fichaTurno" ${mi}>Trocar de turno</button>
        <button id="fichaNum" ${mi}>Alterar número</button>
        <button id="fichaLink" ${mi}>Reenviar link</button>
        ${isCordas() && p.role === "operacional"
          ? `<button id="fichaChief" ${mi}>★ Chefe de turno</button>`
          : ""}
        <button id="fichaExt" ${mi}>Tornar externo</button>
        <button id="fichaDesat" class="secondary mi-danger" type="button" style="min-height:0;padding:8px 12px;width:100%;text-align:left;justify-content:flex-start;font-size:.82rem;font-weight:700">Desativar</button>
      `}
    </div>
  </div>
</div>
<div style="display:flex;align-items:center;gap:12px;margin:12px 0;flex-wrap:wrap">
  <h2 style="margin:0">${escape(p.numero_operacional || "—")}${nome ? " · " + escape(nome) : ""} ${starGold(p)} ${starGestor(p)} <small>· ${escape((turnos.find(t => t.id === p.turno_id) || {}).nome || (isExterno ? (p.quartel || "Externo") + (p.turno_origem ? " · " + p.turno_origem : "") : ""))}</small></h2>
  ${!isExterno ? `
    <div style="display:flex;gap:10px;margin-left:auto;flex-wrap:wrap">
      <label style="display:inline-flex;align-items:center;gap:5px;font-size:.74rem;font-weight:700;color:var(--navy);cursor:pointer;white-space:nowrap">
        <input type="checkbox" class="ficha-telef-check" ${isTelef ? "checked" : ""} disabled style="width:16px;height:16px;min-width:16px;min-height:16px;margin:0;accent-color:var(--red)">
        Resgatador teleférico (auto c/ RT)
      </label>
      <label style="display:inline-flex;align-items:center;gap:5px;font-size:.74rem;font-weight:700;color:var(--navy);cursor:pointer;white-space:nowrap">
        <input type="checkbox" class="ficha-only-t-check" ${soTelef ? "checked" : ""}${isTelef ? "" : " disabled"} style="width:16px;height:16px;min-width:16px;min-height:16px;margin:0;accent-color:var(--red);cursor:pointer">
        Só teleférico
      </label>
    </div>
  ` : ""}
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
  ${ curso("RA", "curso_ra", !!p.curso_ra, !p.curso_ru && !p.curso_ra)
  + curso("RU", "curso_ru", !!p.curso_ra, false)
  + curso("RT", "curso_rt", !!p.curso_ra, !p.curso_ru && !p.curso_rt)}
</div>
${extAtivo ? "" : `<h3>Manobras</h3>
<div class="my-status">${rows || '<p class="empty">Sem manobras.</p>'}</div>`}
${isTelef ? `
  <div style="margin-top:10px;border:1px solid ${teleCol.bd};border-left:4px solid ${teleCol.bd};border-radius:8px;background:${teleCol.bg};padding:8px">
    <strong style="display:block;color:${teleCol.bd};font-size:.8rem;margin-bottom:6px">Resgate em Teleférico</strong>
    <div style="display:flex;gap:6px;justify-content:center">${telePosChips(p.id, false)}</div>
  </div>
` : ""}
<div id="tum" class="msg" role="alert"></div>`;
};

export const renderTeam = async () => {
  const token = ++tokens.team;
  $("teams").innerHTML = skTeam();
  try {
    await loadMoves();
    await Promise.all([loadPeople(), loadLatestAll(), loadSpecialAssignments()]);
    if (token !== tokens.team) return;
    await loadExternos();
    renderTeamUserFilter();

    const teleMove = state.moves.find(m => isSpecialMove(m));
    if (teleMove) await loadTelePosData(teleMove.id);

    const metrics = { g: 0, y: 0, r: 0, k: 0, total: 0, sum: 0 };
    const buildItem = (m, special) => {
      let pessoas;
      if (special) {
        pessoas = state.people.filter(p => p.ativo !== false && userIsTeleferico(p.id));
      } else {
        const base = state.selectedTeamUsers.size
        ? state.people.filter(p => p.ativo !== false && state.selectedTeamUsers.has(String(p.id)))
        : state.people.filter(p => p.ativo !== false);
        pessoas = base.filter(p => !p.so_teleferico);
      }
      const elementos = pessoas.map(p => {
        const dt = state.latestAll.get(pairKey(p.id, m.id));
        const days = daysForRecord(dt);
        const months = monthsForRecord(dt);
        const [s, dot] = estadoFromRecord(dt);
        const hasRecord = !!dt && !isFutureRecord(dt);
        return { p, days, months, hasRecord, s, dot, order: statusOrder(s), numero: p.numero_operacional || p.nome || "—" };
      });
      elementos.sort((a, b) => a.order - b.order || String(a.numero).localeCompare(String(b.numero)));
      elementos.forEach(e => { metrics[e.s]++; metrics.total++; metrics.sum += pairScore(e.s, e.hasRecord); });
      let statusClass = "status-none";
      if (elementos.length) {
        const mediaMonths = Math.round(elementos.reduce((t, x) => t + x.months, 0) / elementos.length);
        statusClass = `status-${estadoFromMonths(mediaMonths)[0]}`;
      }
      const chips = !elementos.length
        ? '<p class="empty">Sem operacionais.</p>'
        : special
          ? `<div class="op-grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${elementos.map(x => teleCard(x.p)).join("")}</div>`
          : `<div class="op-grid">${elementos.map(x => `<div class="op-chip status-${x.s}"><i class="dot ${x.dot}"></i><span>${escape(x.numero)}</span></div>`).join("")}</div>`;
      return {
        mediaDays: elementos.length ? Math.round(elementos.reduce((t, x) => t + x.days, 0) / elementos.length) : 0,
        name: m.nome,
        special,
        html: `<article class="team-card ${statusClass}${special ? " team-card-tall" : ""}"${special ? ' style="grid-column:1/-1"' : ''}><button class="team-toggle" type="button"><span class="team-text"><span class="team-name">${escape(m.nome)}</span></span><span class="arrow">⌄</span></button><div class="details"><div class="details-inner">${chips}</div></div></article>`
      };
    };
    const normalItems = state.moves.filter(m => !isSpecialMove(m)).map(m => buildItem(m, false)).sort((a, b) => b.mediaDays - a.mediaDays || byName({ nome: a.name }, { nome: b.name }));
    const specialItems = state.moves.filter(m => isSpecialMove(m)).map(m => buildItem(m, true));
    const items = [...normalItems, ...specialItems];
    $("teams").innerHTML = items.map(x => x.html).join("") || '<p class="empty">Sem manobras.</p>';
    const pct = metrics.total ? Math.round(metrics.sum / metrics.total) : 0;
    renderReadiness(pct, metrics);
  } catch (_) {
    if (token === tokens.team) {
      $("teams").innerHTML = '<p class="empty">Não foi possível carregar a equipa.</p>';
      renderReadiness(0, { total: 0 });
    }
  }
};

export const refreshManageData = async () => {
  await loadMoves();
  await Promise.all([loadPeople(), loadLatestAll(), loadSpecialAssignments()]);
  const teleMove = state.moves.find(m => isSpecialMove(m));
  if (teleMove) await loadTelePosData(teleMove.id);
};

export const initManage = async () => {
  if (!isChief() && !state.profile?.gestor) return;
  M("gm", "");
  $("users").innerHTML = skList();
  try {
    await refreshManageData();
    renderBatch();
    renderFindFilters(true);
    renderUsers();
    renderMovesList();
    resetFind();
  } catch (_) { M("gm", "Não foi possível carregar a gestão."); }
};

export const refreshManage = async () => {
  if (!isChief() && !state.profile?.gestor) return;
  try {
    await refreshManageData();
    renderBatch();
    renderFindFilters(false);
    renderUsers();
    renderMovesList();
  } catch (_) { M("gm", "Não foi possível carregar a gestão."); }
};

const renderBatch = () => {
  const batchMoves = [...state.moves].sort((a, b) => (isSpecialMove(a) ? 1 : 0) - (isSpecialMove(b) ? 1 : 0) || byName(a, b));
  $("batchUsers").innerHTML = state.people.filter(p => p.ativo !== false).map(p => `<label class="batch-choice"><strong>nº ${escape(p.numero_operacional || "—")}${p.so_teleferico ? ' <small style="font-weight:600;color:var(--muted)">· só teleférico</small>' : ""}</strong><input class="batch-user" type="checkbox" value="${p.id}"></label>`).join("") || '<p class="empty">Sem operacionais.</p>';
  $("batchMoves").innerHTML = batchMoves.map(m => `<label class="batch-choice"><strong>${escape(m.nome)}</strong><input class="batch-move" type="checkbox" value="${m.id}"></label>`).join("") || '<p class="empty">Sem manobras.</p>';
  syncBatch();
};

const syncBatch = () => {
  const users = [...document.querySelectorAll(".batch-user")];
  const moves = [...document.querySelectorAll(".batch-move")];
  const nUsers = users.filter(x => x.checked).length;
  const nMoves = moves.filter(x => x.checked).length;
  $("batchUsersCount").textContent = `${nUsers} selecionado${nUsers === 1 ? "" : "s"}`;
  $("batchMovesCount").textContent = `${nMoves} selecionada${nMoves === 1 ? "" : "s"}`;
  const btn = $("batchSubmit");
  btn.disabled = !(nUsers && nMoves);
  btn.textContent = nUsers && nMoves ? `+ Registar ${nUsers * nMoves} registo${nUsers * nMoves === 1 ? "" : "s"}` : "Seleciona operacionais e manobras";
};

const renderMovesList = () => {
  const sorted = [...state.moves].sort((a, b) => (isSpecialMove(b) ? 1 : 0) - (isSpecialMove(a) ? 1 : 0) || byName(a, b));
  $("moves").innerHTML = sorted.map(m => {
    if (isSpecialMove(m)) {
      return `<div class="row move-special"><button class="move-toggle" type="button"><strong>${escape(m.nome)}</strong><small>Operacionais de teleférico</small></button><div class="move-assign hide">${renderTelefericoAssignments()}</div></div>`;
    }
    return `<div class="row"><strong>${escape(m.nome)}</strong>${isChief() ? `<button class="bin-btn corner dm" data-i="${m.id}" type="button" aria-label="Eliminar" title="Eliminar">${BIN}</button>` : ""}</div>`;
  }).join("") || '<p class="empty">Sem manobras.</p>';
};

const renderTelefericoAssignments = () => {
  if (!state.specialMove) return "";
  if (!state.people.length) return '<p class="empty">Sem operacionais.</p>';
  return `<div class="assign-list">` + state.people.filter(p => p.ativo !== false).map(p => {
    const uid = String(p.id);
    const isT = state.specialAssignments.has(uid);
    return `<div class="assign-item" style="justify-content:space-between">` +
      `<label style="display:flex;align-items:center;gap:6px;min-width:0"><input type="checkbox" class="telef-check" data-u="${uid}" ${isT ? "checked" : ""} disabled title="Automático: tem curso RT"><span>${escape(p.numero_operacional || p.nome || "—")}</span></label>` +
      `<label style="display:flex;align-items:center;gap:5px;font-size:.68rem;color:var(--muted);white-space:nowrap"><input type="checkbox" class="only-t-check" data-u="${uid}" ${p.so_teleferico ? "checked" : ""}${isT ? "" : " disabled"}> só teleférico</label>` +
      `</div>`;
  }).join("") + `</div>`;
};

export const syncCustomDate = () => {
  const on = $("customDateToggle").checked;
  $("customDateWrap").classList.toggle("hide", !on);
  $("customDate").required = on;
  if (on && $("customDate").value > localDateKey()) $("customDate").value = localDateKey();
};

const starGold = (p) => p.role === "chefe_turno" ? `<span style="display:inline-flex;color:#d4a017;font-size:1rem;line-height:1" title="Chefe de turno">★</span>` : "";
const starGestor = (p) => {
  if (p.role !== "operacional" || p.ativo === false) return "";
  if (!isChefeTurno() || state.profile?.turno_id !== p.turno_id || p.id === state.user.id) return "";
  const filled = !!p.gestor;
  const color = filled ? "#c62032" : "#9aa5b1";
  const title = filled ? "Tem acesso à Gestão — tocar para retirar" : "Sem acesso à Gestão — tocar para dar";
  return `<span class="user-star" data-u="${p.id}" style="display:inline-flex;cursor:pointer;color:${color};font-size:1.05rem;line-height:1;padding:0 2px" title="${title}">${filled ? "★" : "☆"}</span>`;
};

const renderUsers = () => {
  const container = $("users");
  const ativos = state.people.filter(p => p.ativo !== false);
  if (!ativos.length) { container.innerHTML = '<p class="empty">Sem utilizadores.</p>'; return; }
  container.innerHTML = ativos.map(p => {
    const nome = nomeFromEmail(p.email) || p.nome || "";
    const userMoves = applicableMovesForUser(p.id).filter(m => !isSpecialMove(m)).map(m => {
      const dt = state.latestAll.get(pairKey(p.id, m.id));
      const [s, dot] = estadoFromRecord(dt);
      const days = daysForRecord(dt);
      const months = monthsForRecord(dt);
      const label = !dt ? "-" : (isFutureRecord(dt) ? "—" : `${days}d`);
      return { days, months, html: `<article class="mini status-${s}"><strong>${escape(m.nome)}</strong><span><i class="dot ${dot}"></i>${label}</span></article>` };
    });
    const isTelef = state.specialAssignments.has(String(p.id));
    const teleHtml = isTelef ? `<article class="mini" style="grid-column:1/-1;flex-direction:column;align-items:stretch;gap:6px;padding:8px"><strong style="color:var(--navy)">Resgate em Teleférico</strong><div style="display:flex;gap:6px;justify-content:center">${telePosChips(p.id)}</div></article>` : "";
    const mediaDays = userMoves.length ? Math.round(userMoves.reduce((t, x) => t + x.days, 0) / userMoves.length) : 365;
    const mediaMonths = userMoves.length ? Math.round(userMoves.reduce((t, x) => t + x.months, 0) / userMoves.length) : NO_RECORD_MONTHS;
    const [cor] = estadoFromMonths(mediaMonths);
    const badge = p.so_teleferico ? " · só teleférico" : "";
    const mediaLabel = userMoves.length ? `média: ${mediaDays} dias` : "sem manobras";
    const roleLabel = p.role === "chefe_cordas" ? "Chefe das cordas" : p.role === "chefe_turno" ? "Chefe de turno" : p.role === "externo" ? "Externo" : "Operacional";
    const inner = userMoves.map(x => x.html).join("") + teleHtml;
    return `<article class="user-box status-${cor}"><button class="user-toggle" type="button" style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left"><span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><strong>nº ${escape(p.numero_operacional || "—")}${nome ? " · " + escape(nome) : ""}</strong>${starGold(p)}${starGestor(p)}</span><small>${roleLabel} · ${mediaLabel}${badge}</small></span><span class="arrow">⌄</span></button><div class="details"><div class="details-inner"><div class="my-status">${inner || '<p class="empty">Sem manobras.</p>'}</div></div></div>${isChefeTurno() && p.id !== state.user.id && p.role !== "externo" ? `<button class="deact-btn corner del" data-u="${p.id}" data-n="${escape(p.nome || p.numero_operacional)}" type="button" aria-label="Desativar" title="Desativar">${POWER}</button>` : ""}</article>`;
  }).join("");
};

export const setTelefericoAssignment = async (userId, checked, checkbox) => {
  // Obsoleto: a atribuição ao teleférico é automática pelo curso RT.
  await loadSpecialAssignments(true);
  if (checkbox) checkbox.checked = state.specialAssignments.has(String(userId));
  if (panelVisible("manage")) renderUsers();
  if (panelVisible("team")) renderTeam();
  renderMoveSelect();
  if (panelVisible("reg")) renderMine();
};

export const setTelePosicao = async (userId, pos, sel) => {
  const uid = String(userId); sel.disabled = true;
  try {
    const { error } = await db.from("profiles").update({ tele_posicao: pos }).eq("id", uid);
    if (error) throw error;
    const p = state.people.find(p => String(p.id) === uid); if (p) p.tele_posicao = pos;
    toast(pos ? `Posição ${pos} atribuída.` : "Posição removida.", "ok");
  } catch (_) { M("gm", "Erro ao atualizar posição."); }
  finally { sel.disabled = false; }
};

export const setOnlyTeleferico = async (userId, checked, checkbox) => {
  const uid = String(userId);
  checkbox.disabled = true;
  try {
    const { error } = await db.from("profiles").update({ so_teleferico: checked }).eq("id", uid);
    if (error) throw error;
    const p = state.people.find(p => String(p.id) === uid);
    if (p) p.so_teleferico = checked;
    if (panelVisible("manage")) renderUsers();
    if (panelVisible("team")) renderTeam();
    renderMoveSelect();
    if (panelVisible("reg")) renderMine();
    toast(checked ? "Marcado como só teleférico." : "Marca removida.", "ok");
  } catch (_) {
    M("gm", "Erro ao atualizar \"só teleférico\".");
    checkbox.checked = !checked;
  } finally { checkbox.disabled = false; }
};

const renderFindFilters = (reset = false) => {
  const findUser = $("findUser"), findMove = $("findMove"), findDate = $("findDate");
  const currentUser = reset ? "" : findUser.value;
  const currentMove = reset ? "" : findMove.value;
  findUser.innerHTML = '<option value="">Todos</option>' + state.people.map(p => `<option value="${p.id}">${escape(p.nome || p.numero_operacional)}${p.so_teleferico ? " · só teleférico" : ""}</option>`).join("");
  findMove.innerHTML = '<option value="">Todas</option>' + state.moves.map(m => `<option value="${m.id}">${escape(m.nome)}</option>`).join("");
  if (reset) { findUser.value = ""; findMove.value = ""; findDate.value = ""; }
  else {
    findUser.value = [...findUser.options].some(o => o.value === currentUser) ? currentUser : "";
    findMove.value = [...findMove.options].some(o => o.value === currentMove) ? currentMove : "";
  }
  findDate.max = localDateKey();
};

const getFindFilters = () => {
  const userId = $("findUser").value, moveId = $("findMove").value;
  let date = $("findDate").value;
  const today = localDateKey();
  if (date && date > today) { date = today; $("findDate").value = today; }
  return { userId, moveId, date };
};

const resetFind = () => { state.find = { rows: [], total: 0, page: 1, status: "idle" }; state.selected.clear(); renderFind(); };
export { resetFind };

export const loadFind = async (page = 1, clearSelection = false) => {
  const filters = getFindFilters();
  if (!filters.userId && !filters.moveId && !filters.date) { state.find = { rows: [], total: 0, page: 1, status: "idle" }; state.selected.clear(); renderFind(); return; }
  if (clearSelection) state.selected.clear();
  state.find.status = "loading"; state.find.page = page; renderFind();
  const token = ++tokens.find;
  try {
    const from = (page - 1) * FIND_PAGE, to = from + FIND_PAGE - 1;
    let query = db.from("registos")
      .select("id,realizado_em,user_id,manobra_id,profiles(nome,numero_operacional),manobras(nome)", { count: "exact" })
      .order("realizado_em", { ascending: false }).order("id", { ascending: false });
    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.moveId) query = query.eq("manobra_id", filters.moveId);
    if (filters.date) query = query.gte("realizado_em", filters.date).lt("realizado_em", nextDateKey(filters.date));
      // operacional/chefe de turno só localizam registos da sua equipa
    const tLimit = visibleTurnoId();
    if (tLimit != null) {
    const ids = state.people.map(p => p.id);
    if (!ids.length) { state.find = { rows: [], total: 0, page: 1, status: "done" }; renderFind(); return; }
    query = query.in("user_id", ids);
  }
    const { data, error, count } = await query.range(from, to);
    if (token !== tokens.find) return;
    if (error) throw error;
    state.find.rows = data || [];
    state.find.total = typeof count === "number" ? count : state.find.rows.length;
    const pages = Math.max(1, Math.ceil(state.find.total / FIND_PAGE));
    if (page > pages && state.find.total > 0) return loadFind(pages, false);
    state.find.page = page; state.find.status = "done"; renderFind();
  } catch (_) {
    if (token !== tokens.find) return;
    state.find.status = "error"; state.find.rows = []; state.find.total = 0; renderFind();
    M("gm", "Não foi possível localizar os registos.");
  }
};

const renderFind = () => {
  const all = $("all"), st = state.find.status;
  if (st === "idle") all.innerHTML = "";
  else if (st === "loading") all.innerHTML = '<div class="all-list">' + skList(5, 40) + '</div>';
  else if (st === "error") all.innerHTML = '<p class="empty">Não foi possível mostrar registos.</p>';
  else if (!state.find.rows.length) all.innerHTML = '<p class="empty">Nenhum registo encontrado.</p>';
  else {
    all.innerHTML = state.find.rows.map(x => {
      const checked = state.selected.has(String(x.id)) ? " checked" : "";
      return `<div class="all-row"><label class="all-label"><input class="all-check" type="checkbox" value="${x.id}"${checked}><span class="all-text"><strong>${escape(x.manobras?.nome || "—")}</strong><small>${escape(x.profiles?.nome || x.profiles?.numero_operacional || "—")} — ${formatDate(x.realizado_em)}</small></span></label></div>`;
    }).join("");
  }
  const pages = Math.max(1, Math.ceil(state.find.total / FIND_PAGE));
  $("allPager").classList.toggle("hide", st !== "done" || state.find.total <= FIND_PAGE);
  $("allPageInfo").textContent = `Página ${pages ? state.find.page : 1} de ${pages}`;
  $("allPrev").disabled = state.find.page <= 1;
  $("allNext").disabled = state.find.page >= pages;
  syncSelectionUI();
};

export const syncSelectionUI = () => {
  const n = state.selected.size, btn = $("deleteSelected");
  btn.classList.toggle("hide", n === 0);
  btn.disabled = n === 0 || state.find.status !== "done";
  const label = n ? `Eliminar ${n} selecionado${n === 1 ? "" : "s"}` : "Eliminar selecionados";
  btn.title = label; btn.setAttribute("aria-label", label);
  updateFindSummary();
};

const updateFindSummary = () => {
  let text; const st = state.find.status;
  if (st === "idle") text = "Seleciona operacional e ou manobra e ou data para localizar registos.";
  else if (st === "loading") text = "A localizar registos…";
  else if (st === "error") text = "Não foi possível localizar registos.";
  else text = state.find.total === 0 ? "Nenhum registo encontrado." : `${state.find.total} registo${state.find.total === 1 ? "" : "s"} encontrado${state.find.total === 1 ? "" : "s"}.`;
  if (st === "done" && state.selected.size) text += ` · ${state.selected.size} selecionado${state.selected.size === 1 ? "" : "s"}`;
  $("findSummary").textContent = text;
};

export const openPasswordConfirm = (title, description, confirmLabel) => {
  return new Promise(resolve => {
    const modal = $("passModal");
    if (!modal) { resolve(false); return; }
    flags.passResolver = resolve;
    $("passModalTitle").textContent = title;
    $("passModalDesc").textContent = description;
    $("passModalInput").value = "";
    $("passModalMsg").className = "msg"; $("passModalMsg").textContent = "";
    const btn = $("passModalConfirm");
    btn.textContent = confirmLabel || "Confirmar";
    btn.disabled = false; btn.classList.remove("busy");
    modal.classList.remove("hide"); modal.style.zIndex = "1300"; document.body.style.overflow = "hidden";
    setTimeout(() => $("passModalInput").focus(), 50);
  });
};

export const closePasswordConfirm = (result) => {
  if (flags.passResolver) { flags.passResolver(result); flags.passResolver = null; }
  const modal = $("passModal");
  if (modal) modal.classList.add("hide");
  document.body.style.overflow = "";
};

export const verifyPasswordAndConfirm = async () => {
  const password = $("passModalInput").value, msg = $("passModalMsg");
  if (!password) { msg.className = "msg e"; msg.textContent = "Introduz a tua palavra-passe."; return; }
  if (!state.user?.email) { msg.className = "msg e"; msg.textContent = "Não foi possível identificar o utilizador atual."; return; }
  const btn = $("passModalConfirm");
  btn.disabled = true; btn.classList.add("busy");
  const { error } = await db.auth.signInWithPassword({ email: state.user.email, password });
  btn.disabled = false; btn.classList.remove("busy");
  if (error) { msg.className = "msg e"; msg.textContent = "Palavra-passe incorreta."; return; }
  closePasswordConfirm(true);
};

export const updateModalOverflow = () => {
  const anyOpen = document.querySelector(".modal-overlay:not(.hide)");
  document.body.style.overflow = anyOpen ? "hidden" : "";
};

export const openSimpleModal = (id) => {
  const m = $(id);
  if (!m) return;
  m.classList.remove("hide");
  m.style.zIndex = "1000";
  updateModalOverflow();
};

export const closeSimpleModal = (id) => {
  const m = $(id);
  if (!m) return;
  m.classList.add("hide");
  updateModalOverflow();
};

export const closeModals = () => {
  closePasswordConfirm(false);
  document.querySelectorAll(".modal-overlay").forEach(m => m.classList.add("hide"));
  updateModalOverflow();
};

/* ================= RELATÓRIO MENSAL DE AUDITORIA ================= */
let lastAuditRows = null;
let lastAuditMonth = "";

const fmtTs = (ts) => {
  const d = new Date(ts);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("pt-PT") + " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
};
const personLabel = (id) => {
  const p = state.people.find(p => p.id === id);
  return p ? (p.nome || p.numero_operacional) : "—";
};
const moveLabel = (id) => {
  const m = state.moves.find(m => String(m.id) === String(id));
  return m ? m.nome : "—";
};

const categorizeAudit = (rows) => {
  const regInserts = rows.filter(a => a.tabela === "registos" && a.operacao === "INSERT");
  const regDeletes = rows.filter(a => a.tabela === "registos" && a.operacao === "DELETE");
  const newUsers = rows.filter(a => a.tabela === "profiles" && a.operacao === "INSERT");
  const deactMap = new Map();
  rows.filter(a => a.tabela === "profiles" && a.operacao === "UPDATE" && a.dados_novos && (a.dados_novos.ativo === false || a.dados_novos.modo === "desativar"))
    .forEach(a => deactMap.set(a.registo_id, a));
  const deactivated = [...deactMap.values()];
  const moveChanges = rows.filter(a => a.tabela === "manobras");
  return { regInserts, regDeletes, newUsers, deactivated, moveChanges };
};

export const renderAuditReport = async (monthKey) => {
  const box = $("auditReport");
  if (!box) return;
  if (!isCordas()) { box.innerHTML = '<p class="empty">Apenas o chefe das cordas pode ver auditoria.</p>'; return; }
  box.innerHTML = '<div class="mine-list">' + skList(5, 40) + '</div>';
  const [y, m] = String(monthKey).split("-").map(Number);
  if (!y || !m) { box.innerHTML = '<p class="empty">Escolhe um mês.</p>'; return; }
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const { data, error } = await db.from("auditoria").select("*")
    .gte("criado_em", start.toISOString()).lt("criado_em", end.toISOString())
    .order("criado_em", { ascending: true });
  if (error) { box.innerHTML = `<p class="empty">Erro: ${escape(error.message)}</p>`; return; }
  const rows = data || [];
  lastAuditRows = rows; lastAuditMonth = monthKey;
  const c = categorizeAudit(rows);
  const list = (items, fn, emptyMsg) => items.length
    ? `<div class="mine-list">` + items.map(fn).join("") + `</div>`
    : `<p class="empty">${emptyMsg}</p>`;
  const h = [];
  h.push(`<h3 style="margin:6px 0">1. Registos de manobras efetuados (${c.regInserts.length})</h3>`);
  h.push(list(c.regInserts, a => { const dn = a.dados_novos || {};
    return `<div class="mine-row"><strong>${escape(moveLabel(dn.manobra_id))} — ${escape(personLabel(dn.user_id))}</strong><small>por ${escape(a.user_numero || personLabel(a.user_id))} · ${fmtTs(a.criado_em)}</small></div>`;
  }, "Sem registos de manobras neste mês."));
  h.push(`<h3 style="margin:14px 0 6px">2. Novos utilizadores (${c.newUsers.length})</h3>`);
  h.push(list(c.newUsers, a => { const dn = a.dados_novos || {};
    return `<div class="mine-row"><strong>${escape(dn.nome || dn.numero_operacional || "—")}</strong><small>nº ${escape(dn.numero_operacional || "—")} · ${fmtTs(a.criado_em)}</small></div>`;
  }, "Sem novos utilizadores neste mês."));
  h.push(`<h3 style="margin:14px 0 6px">3. Utilizadores desativados (${c.deactivated.length})</h3>`);
  h.push(list(c.deactivated, a =>
    `<div class="mine-row"><strong>${escape(personLabel(a.registo_id))}</strong><small>por ${escape(a.user_numero || "—")} · ${fmtTs(a.criado_em)}</small></div>`,
  "Sem utilizadores desativados neste mês."));
  h.push(`<h3 style="margin:14px 0 6px">4. Alterações a manobras (${c.moveChanges.length})</h3>`);
  h.push(list(c.moveChanges, a => { const old = a.dados_antigos || {}, nw = a.dados_novos || {};
    let desc = a.operacao === "INSERT" ? `Criada: ${escape(nw.nome || "—")}` : a.operacao === "DELETE" ? `Eliminada: ${escape(old.nome || "—")}` : `Alterada: ${escape(old.nome || "—")} → ${escape(nw.nome || "—")}`;
    return `<div class="mine-row"><strong>${desc}</strong><small>${escape(a.user_numero || "—")} · ${fmtTs(a.criado_em)}</small></div>`;
  }, "Sem alterações a manobras neste mês."));
  h.push(`<h3 style="margin:14px 0 6px">5. Registos eliminados (${c.regDeletes.length})</h3>`);
  h.push(list(c.regDeletes, a => { const da = a.dados_antigos || {};
    return `<div class="mine-row"><strong>${escape(moveLabel(da.manobra_id))} — ${escape(personLabel(da.user_id))}</strong><small>eliminado por ${escape(a.user_numero || "—")} · ${fmtTs(a.criado_em)}</small></div>`;
  }, "Sem registos eliminados neste mês."));
  box.innerHTML = h.join("");
};

export const exportAuditCSV = () => {
  if (!lastAuditRows) { M("gm", "Gera primeiro o relatório.", "e"); return; }
  const c = categorizeAudit(lastAuditRows);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const L = [];
  L.push(["Secção", "Descrição", "Detalhe", "Quando"].map(esc).join(";"));
  c.regInserts.forEach(a => { const dn = a.dados_novos || {};
    L.push([esc("Registos de manobras"), esc(`${moveLabel(dn.manobra_id)} — ${personLabel(dn.user_id)}`), esc(`por ${a.user_numero || personLabel(a.user_id)}`), esc(fmtTs(a.criado_em))].join(";")); });
  c.newUsers.forEach(a => { const dn = a.dados_novos || {};
    L.push([esc("Novos utilizadores"), esc(dn.nome || dn.numero_operacional || "—"), esc(`nº ${dn.numero_operacional || "—"}`), esc(fmtTs(a.criado_em))].join(";")); });
  c.deactivated.forEach(a =>
    L.push([esc("Utilizadores desativados"), esc(personLabel(a.registo_id)), esc(`por ${a.user_numero || "—"}`), esc(fmtTs(a.criado_em))].join(";")));
  c.moveChanges.forEach(a => { const old = a.dados_antigos || {}, nw = a.dados_novos || {};
    const d = a.operacao === "INSERT" ? `Criada: ${nw.nome || "—"}` : a.operacao === "DELETE" ? `Eliminada: ${old.nome || "—"}` : `Alterada: ${old.nome || "—"} → ${nw.nome || "—"}`;
    L.push([esc("Alterações a manobras"), esc(d), esc(a.user_numero || "—"), esc(fmtTs(a.criado_em))].join(";")); });
  c.regDeletes.forEach(a => { const da = a.dados_antigos || {};
    L.push([esc("Registos eliminados"), esc(`${moveLabel(da.manobra_id)} — ${personLabel(da.user_id)}`), esc(`eliminado por ${a.user_numero || "—"}`), esc(fmtTs(a.criado_em))].join(";")); });
  const csv = "\uFEFF" + L.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const aEl = document.createElement("a");
  aEl.href = url; aEl.download = `auditoria_${lastAuditMonth}.csv`;
  document.body.appendChild(aEl); aEl.click(); aEl.remove();
  URL.revokeObjectURL(url);
  toast("CSV exportado.", "ok");
};
