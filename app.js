/**
 * @module app
 * Orquestração principal: boot, handlers, atalhos, pull-to-refresh
 */
import { state, flags, invalidateMoves, invalidatePeople, invalidateAllRegs, invalidateMyRegs } from "./state.js";
import { db, loadMoves, loadPeople, loadTurnos, loadSpecialAssignments, loadLatestAll, insertRecords, loadProfile, SUPABASE_URL, SUPABASE_ANON_KEY, signupOperacional, signupCordas, sendFirstAccessLink } from "./api.js";
import {
  M, setBtnBusy, toast, applyLegend,
  isChief, isCordas, isChefeTurno, panelVisible, userIsTeleferico, isSpecialMoveId,
  renderMine, renderTeam, initManage, refreshManage, setOnlyTeleferico, setTelePosicao, syncSelectionUI,
  syncCustomDate, setTelefericoAssignment,
  openPasswordConfirm, closePasswordConfirm, verifyPasswordAndConfirm,
  openSimpleModal, closeSimpleModal, closeModals,
  loadFind, resetFind, updateOnlineStatus, rerenderMinePage,
  renderAuditReport, exportAuditCSV,
  openConfirm, bindConfirmModal,
  renderOverview, renderCordasManobras, renderCordasTurnos, renderOperacionalFicha,
  renderCordasAuditoria, buildCommandReport, printReport,
  exportCordasAuditCSV, applyAuditFilters, auditPager, exportBackupJSON, nomeFromEmail, setAuditMode, openCursoHist,
} from "./ui.js";
import {
  localDateKey, isSpecialMove, normalizeId, escape, vibrate, formatDate, MINE_PAGE, FIND_PAGE
} from "./utils.js";

const $ = (id) => document.getElementById(id);

const registerSW = () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
};

const bindInfoPopovers = () => {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".info-btn");
    if (btn) {
      const pop = btn.nextElementSibling;
      const wasHidden = pop.classList.contains("hide");
      document.querySelectorAll(".info-pop").forEach(p => p.classList.add("hide"));
      document.querySelectorAll(".info-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
      if (wasHidden) { pop.classList.remove("hide"); btn.setAttribute("aria-expanded", "true"); }
      return;
    }
    if (!e.target.closest(".info-wrap")) {
      document.querySelectorAll(".info-pop:not(.hide)").forEach(p => p.classList.add("hide"));
      document.querySelectorAll(".info-btn").forEach(b => b.setAttribute("aria-expanded", "false"));
    }
  });
};

const bindLogin = () => {
  $("lf").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector(".primary");
    if (btn.disabled) return;
    setBtnBusy(btn, true, "A entrar…");
    const { error } = await db.auth.signInWithPassword({ email: $("e").value.trim(), password: $("p").value });
    if (error) { setBtnBusy(btn, false); return M("am", "Não foi possível entrar: " + error.message); }
    await start();
    setBtnBusy(btn, false);
  };
};

const start = async () => {
  if (state.user) return true;
  try {
    const { data: { user } } = await db.auth.getUser();
    if (!user) { M("am", "Não foi possível iniciar a sessão."); return false; }
    if (isRecoveryUrl() || pendingPw() === String(user.id)) {
      setPendingPw(user.id);
      showFirstAccess();
      return false;
    }
    let profile = await loadProfile(user);
    if (!profile) throw new Error("Perfil indisponível");
    if (profile.role === "externo") {
      await db.auth.signOut();
      throw new Error("Conta de externo — sem acesso à aplicação.");
    }
    if (profile.ativo === false) {
      const { data: cordasList } = await db.from("profiles")
        .select("email").eq("role", "chefe_cordas").eq("ativo", true).limit(1);
      const emailCordas = cordasList?.[0]?.email;
      await db.auth.signOut();
      throw new Error(emailCordas
        ? `Conta desativada. Só o Chefe das Cordas pode reativar-te — contacta ${emailCordas}.`
        : "Conta desativada. Só o Chefe das Cordas pode reativar-te.");
    }

    state.user = user;
    state.profile = { ...profile };
    const cordas = isCordas();
    $("who").textContent = cordas
      ? (nomeFromEmail(state.profile.email) || state.profile.nome || "Chefe das Cordas")
      : (state.profile.nome || state.profile.numero_operacional || "—");
    const who = $("who");
    if (cordas) {
      who.style.cursor = "pointer"; who.style.textDecoration = "underline";
      who.title = "Transferir Chefia"; who.onclick = openTransferModal;
    } else {
      who.style.cursor = ""; who.style.textDecoration = ""; who.title = ""; who.onclick = null;
    }
    $("role").textContent = cordas
      ? "Chefe das Cordas"
      : (isChefeTurno() ? "Chefe de turno" : "Operacional") + (state.profile.turno_id ? " · T" + state.profile.turno_id : "");
      const tid = state.profile.turno_id;
    $("appTitle").textContent = cordas || !tid ? "CID" : "T" + tid;
    $("appSub").textContent = cordas || !tid ? "EQUIPAS DE RESGATE POR CORDAS" : "EQUIPA DE RESGATE POR CORDAS";
    document.querySelectorAll(".cordas-tab").forEach(b => b.classList.toggle("hide", !cordas));
    document.querySelector('[data-x="reg"]').classList.toggle("hide", cordas);
    document.querySelector('[data-x="team"]').classList.toggle("hide", cordas);
    $("mt").classList.toggle("hide", !(isChefeTurno() || !!state.profile?.gestor));
    $("tabs").classList.toggle("admin", isChief() || !!state.profile?.gestor);
    $("auth").classList.add("hide"); $("app").classList.remove("hide");
    requestAnimationFrame(syncTabGlide);
    document.querySelectorAll(".tab,.panel").forEach(x => x.classList.remove("on"));
    const defaultTab = cordas ? "ov" : "reg";
    document.querySelector(`[data-x="${defaultTab}"]`).classList.add("on");
    $(defaultTab).classList.add("on");
    M("rm", ""); M("gm", ""); M("am", "");
    closeModals();
    await loadMoves(); await loadSpecialAssignments(); await loadPeople();
    if (cordas) renderOverview(); else await renderMine();
    return true;
  } catch (err) {
    state.user = null; state.profile = null;
    $("app").classList.add("hide"); $("auth").classList.remove("hide");
    M("am", err?.message || "Não foi possível iniciar a sessão.");
    return false;
  }
};

const resetAuth = () => {
  state.user = null; state.profile = null; state.moves = []; state.people = [];
  state.latestAll = new Map(); state.latestMine = new Map(); state.myRows = []; state.myPage = 1;
  state.selected.clear(); state.selectedTeamUsers.clear(); state.find = { rows: [], total: 0, page: 1, status: "idle" };
  state.promises = {}; state.movesDirty = true; state.peopleDirty = true; state.allDirty = true;
  state.allLoaded = false; state.myDirty = true; state.myLoaded = false;
  state.specialMove = null; state.specialAssignments.clear(); state.overviewTurno = null; state.overviewTele = false;
  state.pendingMoves = new Map();
  state.fichaUser = null;
  $("app").classList.add("hide"); $("auth").classList.remove("hide");
  $("login").classList.remove("hide"); $("firstAccess").classList.add("hide");
  $("am").className = "msg"; $("tabs").classList.remove("admin"); $("mt").classList.add("hide");
  $("lf").reset(); closeModals();
  $("appTitle").textContent = "CID";
  $("appSub").textContent = "EQUIPAS DE RESGATE POR CORDAS";
  requestAnimationFrame(syncTabGlide);
};

/* ===== Indicador dinâmico dos separadores (magic line) ===== */
const syncTabGlide = () => {
  const tabs = $("tabs");
  if (!tabs) return;
  let g = $("tabGlide");
  if (!g) {
    g = document.createElement("div");
    g.id = "tabGlide";
    g.setAttribute("aria-hidden", "true");
    tabs.appendChild(g);
  }
  const active = tabs.querySelector(".tab.on") || tabs.querySelector("[data-x].on");
  if (!active) { g.style.width = "0px"; return; }
  const tr = tabs.getBoundingClientRect();
  const ar = active.getBoundingClientRect();
  const first = !g.dataset.ready;
  if (first) g.style.transition = "none";   // 1ª vez: nasce no sítio, sem voar
  g.style.left = (ar.left - tr.left) + "px";
  g.style.width = ar.width + "px";
  if (first) {
    void g.offsetWidth;
    requestAnimationFrame(() => { g.style.transition = ""; g.dataset.ready = "1"; });
  }
};

const switchTab = (name) => {
  closeModals();
  if (name !== "ov") { state.overviewTurno = null; state.overviewTele = false; }
  document.querySelectorAll(".tab,.panel").forEach(x => x.classList.remove("on"));
  const tab = document.querySelector(`[data-x="${name}"]`);
  if (tab) tab.classList.add("on");
  const panel = $(name); if (panel) panel.classList.add("on");
  requestAnimationFrame(syncTabGlide);
  if (name === "reg") renderMine();
  if (name === "team") renderTeam();
  if (name === "manage") initManage();
  if (name === "ov") renderOverview();
  if (name === "mv") renderCordasManobras();
  if (name === "tu") renderCordasTurnos();
  if (name === "au") renderCordasAuditoria();
};

const handleDeleteMove = async (btn) => {
  if (btn.disabled) return;
  const id = normalizeId(btn.dataset.i);
  const move = state.moves.find(m => String(m.id) === String(id));
  if (move && isSpecialMove(move)) { M("gm", "Esta manobra não pode ser eliminada."); return; }
  const ok = await openPasswordConfirm("Eliminar manobra",
    "Eliminar esta manobra e todos os seus registos? Esta ação é definitiva e exige a tua palavra-passe.", "Eliminar");
  if (!ok) return;
  btn.disabled = true; btn.classList.add("busy");
  try {
    const { error: regError } = await db.from("registos").delete().eq("manobra_id", id);
    if (regError) throw regError;
    const { error } = await db.from("manobras").delete().eq("id", id);
    if (error) throw error;
    M("gm", "Manobra eliminada.", "ok");
    invalidateMoves(); invalidateAllRegs(); invalidateMyRegs();
    await loadMoves(true);
    if (panelVisible("manage")) await refreshManage();
    if (panelVisible("team")) renderTeam();
    if (panelVisible("reg")) renderMine();
  } catch (err) { M("gm", err.message); btn.disabled = false; btn.classList.remove("busy"); }
};

const handleMvCreate = async () => {
  const nome = $("mvNew").value.trim();
  if (!nome) return M("mvm", "Indica um nome para a manobra.");
  const ok = await openPasswordConfirm("Nova manobra", `Criar a manobra "${nome}"?`, "Criar");
  if (!ok) return;
  const { error } = await db.from("manobras").insert({ nome });
  if (error) return M("mvm", error.message);
  invalidateMoves();
  await renderCordasManobras();
  M("mvm", "Manobra criada.", "ok");
};

const handleMvRename = async (btn) => {
  const novo = await openTextModal("Novo nome da manobra", btn.dataset.n);
  if (novo === undefined || !novo || !novo.trim()) return;
  if (novo.trim() === btn.dataset.n) return;
  const ok = await openPasswordConfirm("Renomear manobra",
    `Renomear "${btn.dataset.n}" para "${novo.trim()}"?`, "Renomear");
  if (!ok) return;
  const { error } = await db.from("manobras").update({ nome: novo.trim() }).eq("id", btn.dataset.i);
  if (error) return M("mvm", error.message);
  invalidateMoves();
  await renderCordasManobras();
  M("mvm", "Manobra renomeada.", "ok");
};

const handleMvSetAtivo = async (btn, ativo) => {
  const ok = await openPasswordConfirm(ativo ? "Reativar manobra" : "Desativar manobra",
    `${ativo ? "Reativar" : "Desativar"} "${btn.dataset.n}"? ${ativo ? "" : "Os registos existentes são mantidos."}`,
    ativo ? "Reativar" : "Desativar");
  if (!ok) return;
  const { error } = await db.from("manobras").update({ ativo }).eq("id", btn.dataset.i);
  if (error) return M("mvm", error.message);
  invalidateMoves();
  await renderCordasManobras();
  M("mvm", ativo ? "Manobra reativada." : "Manobra desativada.", "ok");
};

const bindForms = () => {
  $("rf").onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector(".primary");
    if (btn.disabled || btn.classList.contains("busy")) return;
    const moveValue = $("move").value;
    if (!moveValue) return M("rm", "Selecionar uma manobra.");
    const manobraId = normalizeId(moveValue);
    if (isSpecialMoveId(manobraId) && !userIsTeleferico(state.user?.id)) return M("rm", "Não tens autorização para registar esta manobra.");
    const today = localDateKey();
    setBtnBusy(btn, true, "A registar…");
    let posicao = null;
    if (isSpecialMoveId(manobraId)) {
      posicao = await openPosModal(`nº ${state.profile?.numero_operacional || "—"}`);
      if (!posicao) { setBtnBusy(btn, false); return M("rm", "Registo cancelado."); }
    }
    const result = await insertRecords([{ user_id: state.user.id, manobra_id: manobraId, realizado_em: today, posicao }]);
    setBtnBusy(btn, false);
    if (result.error) return M("rm", result.error.message);
    if (!result.inserted) return M("rm", "Esta manobra já está registada para hoje.", "ok");
    M("rm", "Manobra registada com sucesso.", "ok");
    toast("Manobra registada", "ok", 2500);
    vibrate(30);
    e.target.reset();
    invalidateMyRegs(); invalidateAllRegs();
    await renderMine(true);
    if (panelVisible("team")) renderTeam();
    if (panelVisible("manage") && isChief()) refreshManage();
  };

  $("cf").addEventListener("change", (e) => {
    if (e.target.matches(".batch-user,.batch-move")) {
      const users = [...document.querySelectorAll(".batch-user")];
      const moves = [...document.querySelectorAll(".batch-move")];
      const nU = users.filter(x => x.checked).length;
      const nM = moves.filter(x => x.checked).length;
      $("batchUsersCount").textContent = `${nU} selecionado${nU === 1 ? "" : "s"}`;
      $("batchMovesCount").textContent = `${nM} selecionada${nM === 1 ? "" : "s"}`;
      const btn = $("batchSubmit");
      btn.disabled = !(nU && nM);
      btn.textContent = nU && nM ? `+ Registar ${nU * nM} registo${nU * nM === 1 ? "" : "s"}` : "Seleciona operacionais e manobras";
    }
    if (e.target.id === "customDateToggle") syncCustomDate();
  });

  $("cf").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("batchSubmit");
    if (btn.disabled || btn.classList.contains("busy")) return;
    const userIds = [...document.querySelectorAll(".batch-user:checked")].map(x => x.value);
    const moveIds = [...document.querySelectorAll(".batch-move:checked")].map(x => normalizeId(x.value));
    const total = userIds.length * moveIds.length;
    if (!total) return;
    const customOn = $("customDateToggle").checked, customDateValue = $("customDate").value, today = localDateKey();
    if (customOn && !customDateValue) return M("gm", "Escolhe o dia do registo.");
    const day = customOn ? customDateValue : today;
    if (day > today) return M("gm", "A data do registo não pode ser futura.");
    const ok = await openConfirm({
      title: "Registar em lote",
      message: `Vais criar ${total} registo(s) para ${userIds.length} operacional(is). Confirmar?`,
      confirmLabel: "Registar"
    });
    if (!ok) return;
    setBtnBusy(btn, true, "A registar…");
    await loadSpecialAssignments();
    await loadPeople();
    const personById = (id) => state.people.find(p => String(p.id) === String(id));
    const rows = []; let skippedSpecial = 0; let skippedSo = 0;
    for (const uid of userIds) { for (const mid of moveIds) {
      const special = isSpecialMoveId(mid);
      if (special && !userIsTeleferico(uid)) { skippedSpecial++; continue; }
      if (!special && personById(uid)?.so_teleferico) { skippedSo++; continue; }
      let posicao = null;
      if (special) {
        posicao = await openPosModal(`nº ${personById(uid)?.numero_operacional || "—"}`);
        if (!posicao) { setBtnBusy(btn, false); return M("gm", "Registo cancelado."); }
      }
      rows.push({ user_id: uid, manobra_id: mid, realizado_em: day, posicao });
    } }
    if (!rows.length) { setBtnBusy(btn, false); return M("gm", "Nenhum registo válido para criar. A manobra Resgate em Teleférico só pode ser registada em operacionais de teleférico."); }
    const result = await insertRecords(rows);
    setBtnBusy(btn, false);
    if (result.error) return M("gm", result.error.message);
    const added = result.inserted, ignored = result.ignored;
    let message = ignored ? `${added} registo${added === 1 ? "" : "s"} adicionado${added === 1 ? "" : "s"}; ${ignored} duplicado${ignored === 1 ? "" : "s"} ignorado${ignored === 1 ? "" : "s"}.` : `${added} registo${added === 1 ? "" : "s"} adicionado${added === 1 ? "" : "s"}.`;
    if (skippedSpecial) message += ` ${skippedSpecial} registo${skippedSpecial === 1 ? "" : "s"} de teleférico ignorado${skippedSpecial === 1 ? "" : "s"} por operacional não atribuído.`;
    if (skippedSo) message += ` ${skippedSo} registo${skippedSo === 1 ? "" : "s"} ignorado${skippedSo === 1 ? "" : "s"}: operacional "só teleférico" não faz esta manobra.`;
    M("gm", message, "ok");
    toast(message, "ok", 4000);
    e.target.reset();
    syncCustomDate();
    $("batchUsersCount").textContent = "0 selecionados";
    $("batchMovesCount").textContent = "0 selecionadas";
    $("batchSubmit").disabled = true;
    $("batchSubmit").textContent = "Seleciona operacionais e manobras";
    invalidateAllRegs(); invalidateMyRegs();
    resetFind();
    await loadLatestAll(true);
    if (panelVisible("manage")) await refreshManage();
    if (panelVisible("team")) renderTeam();
    if (panelVisible("reg")) renderMine();
  };

  $("mf").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("mf").querySelector(".secondary");
    if (btn.disabled) return;
    const nome = $("newmove").value.trim();
    if (!nome) return;
    setBtnBusy(btn, true, "A adicionar…");
    const { error } = await db.from("manobras").insert({ nome });
    setBtnBusy(btn, false);
    if (error) return M("gm", error.message);
    $("newmove").value = "";
    M("gm", "Manobra adicionada.", "ok");
    invalidateMoves();
    await loadMoves(true);
    if (panelVisible("manage")) await refreshManage();
    if (panelVisible("team")) renderTeam();
    if (panelVisible("reg")) renderMine();
  };
};

const bindDelegated = () => {
  $("out").onclick = async () => { await db.auth.signOut(); resetAuth(); M("am", "Sessão terminada.", "ok"); };
  $("manualBtn").onclick = () => openSimpleModal(isCordas() ? "manualCordasModal" : isChefeTurno() ? "manualChefeModal" : "manualOperacionalModal");
  document.querySelectorAll("[data-x]").forEach(b => { b.onclick = () => switchTab(b.dataset.x); });

  $("mv").addEventListener("click", async (e) => {
    if (e.target.closest("#mvAdd")) { await handleMvCreate(); return; }
    const rn = e.target.closest(".mv-rename"); if (rn) { await handleMvRename(rn); return; }
    const ds = e.target.closest(".mv-disable"); if (ds) { await handleMvSetAtivo(ds, false); return; }
    const en = e.target.closest(".mv-enable"); if (en) { await handleMvSetAtivo(en, true); return; }
  });

  $("au").addEventListener("change", (e) => {
    if (e.target.id === "auMode") { setAuditMode(e.target.value); return; }
    if (e.target.id === "rpMode") {
      const annual = e.target.value === "anual";
      $("rpMonth").classList.toggle("hide", annual);
      $("rpYear").classList.toggle("hide", !annual);
    }
  });

$("au").addEventListener("click", async (e) => {
  if (e.target.closest("#auFilter")) {
    await applyAuditFilters($("auFrom").value, $("auTo").value, $("auTurno").value, $("auMove")?.value || "", $("auNum")?.value || "");
    return;
  }
  const adel = e.target.closest(".audit-del");
  if (adel) { await handleAuditDelete(adel); return; }
  const areat = e.target.closest(".audit-reat");
  if (areat) { await handleAuditReactivate(areat); return; }
  if (e.target.closest("#auPrev")) { auditPager(-1); return; }
  if (e.target.closest("#auNext")) { auditPager(1); return; }
  if (e.target.closest("#auCsv")) { exportCordasAuditCSV(); return; }
  if (e.target.closest("#rpGen")) {
    const btn = e.target.closest("#rpGen");
    if (btn.disabled) return;
    setBtnBusy(btn, true, "A gerar…");
    const html = await buildCommandReport($("rpMode").value, $("rpMonth").value, Number($("rpYear").value));
    $("rpOut").innerHTML = html;
    $("rpPrint").classList.remove("hide");
    setBtnBusy(btn, false);
    return;
  }
  if (e.target.closest("#rpPrint")) { printReport(); return; }
  if (e.target.closest("#bkExport")) {
    const btn = e.target.closest("#bkExport");
    if (btn.disabled) return;
    setBtnBusy(btn, true, "A exportar…");
    await exportBackupJSON();
    setBtnBusy(btn, false);
    return;
  }
});

  $("tu").addEventListener("click", async (e) => {
  if (e.target.closest("#fichaMenuBtn")) { const m = $("fichaMenu"); if (m) m.classList.toggle("hide"); return; }
  const openMenu = $("fichaMenu");
  if (openMenu && !openMenu.classList.contains("hide") && !e.target.closest("#fichaMenu")) openMenu.classList.add("hide");
  if (e.target.closest("#fichaMenu")) setTimeout(() => { const m = $("fichaMenu"); if (m) m.classList.add("hide"); }, 0);
  if (e.target.closest("#opAdd")) { await handleAddOperacional(); return; }
  const chip = e.target.closest(".ficha-btn"); if (chip) { await renderOperacionalFicha(chip.dataset.u); return; }
  if (e.target.closest("#fichaBack")) { await renderCordasTurnos(); return; }
  if (e.target.closest("#fichaTurno")) { openTurnoModal(); return; }
  const cb = e.target.closest(".curso-btn"); if (cb) { await openCursoHist(state.fichaUser, cb.dataset.c); return; }
  if (e.target.closest("#fichaOrigem")) { await handleTurnoOrigem(); return; }
  if (e.target.closest("#fichaImport")) { await handleImportCID(); return; }
  if (e.target.closest("#fichaRemoverCID")) { await handleRemoverCID(); return; }
  if (e.target.closest("#fichaExt")) { await handleTornarExterno(); return; }
  if (e.target.closest("#fichaNum")) { await handleFichaRenumber(); return; }
  if (e.target.closest("#fichaLink")) { await handleReenviarLink(); return; }
  if (e.target.closest("#fichaChief")) { await handleTornarChefeTurno(); return; }
  const starF = e.target.closest(".user-star"); if (starF) { await handleToggleGestor(starF.dataset.u); return; }
  if (e.target.closest("#fichaDesat")) { await handleFichaDesativar(); return; }
});

  $("tu").addEventListener("change", (e) => {
    if (e.target.id === "opExt") syncOpExt();
  });

  $("tu").addEventListener("change", async (e) => {
    const ce = e.target.closest(".curso-edit");
    if (ce) {
      const p = state.people.find(x => String(x.id) === String(state.fichaUser));
      if (!p) return;
      const novo = ce.value || null;
      if (novo === (p[ce.dataset.c] || null)) return;
      const ok = await openConfirm({ title: "Confirmar data", message: `Guardar ${ce.dataset.c.toUpperCase()} = ${novo || "(vazio)"}?`, confirmLabel: "Guardar" });
      if (!ok) { await renderOperacionalFicha(p.id); return; }
      const { error } = await db.from("profiles").update({ [ce.dataset.c]: novo }).eq("id", p.id);
      if (error) return M("tum", error.message);
      // Regra: RT com data → resgatador de teleférico automático; RT vazio → perde a atribuição
      if (ce.dataset.c === "curso_rt") {
        const teleCheck = document.querySelector(".ficha-telef-check") || document.createElement("input");
        if (ce.value && !state.specialAssignments.has(String(p.id))) {
          await setTelefericoAssignment(p.id, true, teleCheck);
        } else if (!ce.value && state.specialAssignments.has(String(p.id))) {
          const onlyT = document.querySelector(".ficha-only-t-check");
          if (onlyT && onlyT.checked) { onlyT.checked = false; await setOnlyTeleferico(p.id, false, onlyT); }
          await setTelefericoAssignment(p.id, false, teleCheck);
        }
      }
      invalidatePeople();
      await renderOperacionalFicha(p.id);
      M("tum", (ce.dataset.c === "curso_rt" && ce.value)
        ? "Curso RT registado — operacional atribuído ao teleférico."
        : "Curso atualizado.", "ok");
      return;
    }
    if (e.target.matches(".ficha-telef-check")) {
      await setTelefericoAssignment(state.fichaUser, e.target.checked, e.target);
      const onlyT = document.querySelector(".ficha-only-t-check");
      if (onlyT) {
        onlyT.disabled = !e.target.checked;
        if (!e.target.checked && onlyT.checked) {
          onlyT.checked = false;
          await setOnlyTeleferico(state.fichaUser, false, onlyT);
        }
      }
      await renderOperacionalFicha(state.fichaUser);
      return;
    }
    if (e.target.matches(".ficha-only-t-check")) {
      await setOnlyTeleferico(state.fichaUser, e.target.checked, e.target);
      await renderOperacionalFicha(state.fichaUser);
      return;
    }
  });

$("users").addEventListener("click", async (e) => {
  const star = e.target.closest(".user-star");
  if (star) { await handleToggleGestor(star.dataset.u); return; }
  const toggle = e.target.closest(".user-toggle");
  if (toggle) { toggle.closest(".user-box").classList.toggle("open"); return; }
  const del = e.target.closest(".del");
  if (del) { await handleDeactivate(del); return; }
});
  $("teams").addEventListener("click", (e) => {
    const toggle = e.target.closest(".team-toggle");
    if (toggle) toggle.closest(".team-card").classList.toggle("open");
  });

  $("clearTeamFilter").onclick = () => {
  state.selectedTeamUsers.clear();
  document.querySelectorAll(".team-user-check").forEach(c => { c.checked = false; });
  renderTeam();
};

  $("teamUserFilter").addEventListener("change", (e) => {
    if (e.target.classList.contains("team-user-check")) {
      const uid = String(e.target.dataset.u);
      if (e.target.checked) state.selectedTeamUsers.add(uid);
      else state.selectedTeamUsers.delete(uid);
      renderTeam();
    }
  });

  $("moves").addEventListener("click", (e) => {
    const toggle = e.target.closest(".move-toggle");
    if (toggle) { const panel = toggle.closest(".row")?.querySelector(".move-assign"); if (panel) panel.classList.toggle("hide"); return; }
    const btn = e.target.closest(".dm");
    if (btn) handleDeleteMove(btn);
  });

  $("moves").addEventListener("change", (e) => {
    if (e.target.classList.contains("telef-check")) setTelefericoAssignment(e.target.dataset.u, e.target.checked, e.target);
    if (e.target.classList.contains("only-t-check")) setOnlyTeleferico(e.target.dataset.u, e.target.checked, e.target);
  });

  $("all").addEventListener("change", (e) => {
    if (e.target.classList.contains("all-check")) {
      const id = String(e.target.value);
      if (e.target.checked) state.selected.add(id);
      else state.selected.delete(id);
      syncSelectionUI();
    }
  });

  $("ov").addEventListener("click", async (e) => {
    if (e.target.closest("#ovBack")) { state.overviewTurno = null; state.overviewTele = false; renderOverview(); return; }
    if (e.target.closest("#ovTele")) { state.overviewTele = true; renderOverview(); return; }
    const treg = e.target.closest(".tele-pos-reg");
    if (treg) { await handleTelePosReg(treg); return; }
    const tchip = e.target.closest(".tele-chip");
    if (tchip) { state.overviewTele = false; switchTab("tu"); renderOperacionalFicha(tchip.dataset.u); return; }
    const tog = e.target.closest(".team-toggle");
    if (tog) { tog.closest(".team-card").classList.toggle("open"); return; }
    const card = e.target.closest(".turno-card");
    if (card) { state.overviewTurno = Number(card.dataset.t); renderOverview(); }
  });

  ["findUser", "findMove", "findDate"].forEach(id => {
    $(id).addEventListener("change", () => { clearTimeout(flags.findTimer); flags.findTimer = setTimeout(() => loadFind(1, true), 250); });
  });

  $("deleteSelected").onclick = async () => {
    const btn = $("deleteSelected");
    if (btn.disabled) return;
    const ids = [...state.selected];
    if (!ids.length) return;
    const ok = await openPasswordConfirm("Eliminar registos", `Eliminar ${ids.length} registo(s)? Esta ação é definitiva.`, "Eliminar");
    if (!ok) return;
    btn.disabled = true; btn.classList.add("busy");
    try {
      const numeric = ids.every(x => /^\d+$/.test(x));
      const finalIds = numeric ? ids.map(Number) : ids;
      const { error } = await db.from("registos").delete().in("id", finalIds);
      if (error) throw error;
      M("gm", "Registos eliminados.", "ok");
      toast("Registos eliminados", "ok");
      state.selected.clear();
      invalidateAllRegs(); invalidateMyRegs();
      await loadLatestAll(true);
      if (panelVisible("manage")) await refreshManage();
      await loadFind(state.find.page, false);
      if (panelVisible("team")) renderTeam();
      if (panelVisible("reg")) renderMine();
    } catch (err) { M("gm", err.message); }
    finally { btn.disabled = false; btn.classList.remove("busy"); syncSelectionUI(); }
  };

  $("minePrev").onclick = () => {
    if (state.myPage > 1) { state.myPage--; rerenderMinePage(); $("mine").scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  $("mineNext").onclick = () => {
    const pages = Math.max(1, Math.ceil(state.myRows.length / MINE_PAGE));
    if (state.myPage < pages) { state.myPage++; rerenderMinePage(); $("mine").scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  $("allPrev").onclick = () => { if (state.find.page > 1) loadFind(state.find.page - 1, false); };
  $("allNext").onclick = () => { const pages = Math.max(1, Math.ceil(state.find.total / FIND_PAGE)); if (state.find.page < pages) loadFind(state.find.page + 1, false); };
};

const EMAIL_CIDADE = /^[a-z0-9]+([.\-][a-z0-9]+)*@cm-lisboa\.pt$/i;
const transferValid = () =>
  $("trNome").value.trim().length > 1 &&
  EMAIL_CIDADE.test($("trEmail").value.trim());

const syncTransferBtn = () => $("trOk").classList.toggle("hide", !transferValid());

const handleReenviarLink = async () => {
  const p = personF(state.fichaUser);
  if (!p || !p.email) return M("tum", "Este perfil não tem e-mail.");
  const ok = await openPasswordConfirm("Reenviar link",
    `Reenviar o link de primeiro acesso para ${p.email}?`, "Reenviar");
  if (!ok) return;
  const { error } = await sendFirstAccessLink(p.email);
  if (error) return M("tum", error.message);
  M("tum", `Link de acesso reenviado para ${p.email}.`, "ok");
  toast(`Link reenviado para ${p.email}.`, "ok", 5000);
};

const openTransferModal = () => {
  if (!isCordas()) return;
  $("trNome").value = ""; $("trEmail").value = "";
  $("trMsg").className = "msg"; $("trMsg").textContent = "";
  syncTransferBtn();
  openSimpleModal("transferModal");
};

const bindTransferModal = () => {
  ["trNome", "trEmail"].forEach(id => $(id).addEventListener("input", syncTransferBtn));
  $("trOk").onclick = async () => {
    const btn = $("trOk");
    if (btn.disabled || !transferValid()) return;
    const nome = $("trNome").value.trim();
    const email = $("trEmail").value.trim().toLowerCase();
    closeSimpleModal("transferModal");
    const ok = await openPasswordConfirm("Transferir chefia",
      `Vais transferir a chefia das cordas para ${nome}. Ficarás desativado — só voltas se a chefia te for transferida de novo. O sucessor recebe o link de primeiro acesso por e-mail.`,
      "Transferir");
    if (!ok) return;
    const res = await signupCordas({ email });
    if (res.error && !/already registered/i.test(res.error.message)) {
      toast("Não foi possível criar a conta: " + res.error.message, "err");
      return;
    }
    const { error } = await db.rpc("transferir_gestao_v2",
      { p_novo_id: res.id || null, p_nome: nome, p_email: email });
    if (error) { toast("Não foi possível transferir: " + error.message, "err"); return; }
    await db.auth.signOut();
    resetAuth();
    M("am", "Chefia transferida. O novo Chefe das Cordas recebe o link de primeiro acesso no e-mail.", "ok");
  };
};

const bindDetailsTransitions = () => {
  const animate = (details, shouldOpen) => {
    const content = details.querySelector(":scope > summary + *");
    if (!content) { details.open = shouldOpen; return; }
    if (details.dataset.animating === "1") return;
    details.dataset.animating = "1";
    const finish = (open) => { content.style.height = ""; content.style.overflow = ""; content.style.transition = ""; details.open = open; details.classList.remove("closing"); delete details.dataset.animating; };
    if (shouldOpen) {
      details.classList.remove("closing"); details.open = true;
      const h = content.scrollHeight;
      content.style.overflow = "hidden"; content.style.height = "0px";
      requestAnimationFrame(() => { content.style.transition = "height .22s ease"; content.style.height = h + "px"; });
      content.addEventListener("transitionend", function te(e) { if (e.propertyName === "height") { content.removeEventListener("transitionend", te); finish(true); } });
      setTimeout(() => { if (details.dataset.animating === "1") finish(true); }, 300);
    } else {
      details.classList.add("closing");
      const h = content.scrollHeight;
      content.style.overflow = "hidden"; content.style.height = h + "px";
      requestAnimationFrame(() => { content.style.transition = "height .22s ease"; content.style.height = "0px"; });
      content.addEventListener("transitionend", function te(e) { if (e.propertyName === "height") { content.removeEventListener("transitionend", te); finish(false); } });
      setTimeout(() => { if (details.dataset.animating === "1") finish(false); }, 300);
    }
  };
  document.querySelectorAll("details.manage-group summary").forEach(summary => {
    summary.addEventListener("click", (e) => { e.preventDefault(); const details = summary.parentElement; animate(details, !details.open); });
  });
};

const bindSimpleModals = () => {
  document.querySelectorAll("[data-open-modal]").forEach(btn => { btn.onclick = () => openSimpleModal(btn.dataset.openModal); });
  document.querySelectorAll("[data-close-modal]").forEach(btn => { btn.onclick = () => closeSimpleModal(btn.dataset.closeModal); });
  document.querySelectorAll(".modal-overlay[data-simple-modal]").forEach(m => {
    m.addEventListener("click", (e) => { if (e.target === m) closeSimpleModal(m.id); });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelectorAll(".modal-overlay[data-simple-modal]:not(.hide)").forEach(m => closeSimpleModal(m.id));
  });
};

const bindPasswordModal = () => {
  const confirmBtn = $("passModalConfirm"), closeBtn = $("passModalClose"), modal = $("passModal"), input = $("passModalInput");
  if (!confirmBtn || !closeBtn || !modal || !input) return;
  confirmBtn.onclick = verifyPasswordAndConfirm;
  closeBtn.onclick = () => closePasswordConfirm(false);
  modal.onclick = (e) => { if (e.target === modal) closePasswordConfirm(false); };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") verifyPasswordAndConfirm(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.classList.contains("hide")) closePasswordConfirm(false); });
};

const bindKeyboardShortcuts = () => {
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, select, textarea")) return;
    if (e.ctrlKey && e.key === "r") { e.preventDefault(); const moveEl = $("move"); if (moveEl) moveEl.focus(); }
    if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const findUser = $("findUser");
      if (findUser) { switchTab("manage"); setTimeout(() => findUser.focus(), 100); }
    }
  });
};

const bindPullToRefresh = () => {
  let startY = 0, pulling = false;
  const app = $("app");
  if (!app) return;
  app.addEventListener("touchstart", (e) => {
    if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });
  app.addEventListener("touchend", async (e) => {
    if (!pulling) return;
    const dy = (e.changedTouches[0]?.clientY || 0) - startY;
    pulling = false;
    if (dy > 80) {
      toast("A atualizar…", "info", 1500);
      invalidateAllRegs(); invalidateMyRegs(); invalidateMoves(); invalidatePeople();
      const currentTab = document.querySelector(".tab.on")?.dataset.x;
      if (currentTab === "reg") await renderMine(true);
      else if (currentTab === "team") await renderTeam();
      else if (currentTab === "manage") await refreshManage();
      toast("Atualizado", "ok", 1500);
    }
  }, { passive: true });
};

const bindConnectivity = () => {
  window.addEventListener("online", () => { updateOnlineStatus(); toast("Ligação restaurada", "ok"); });
  window.addEventListener("offline", () => { updateOnlineStatus(); toast("Sem ligação à internet", "err"); });
  updateOnlineStatus();
};

const bindAudit = () => {
  const monthInput = $("auditMonth");
  const gen = $("auditGen");
  const csv = $("auditCsv");
  if (!monthInput || !gen) return;
  const now = new Date();
  monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  gen.onclick = () => renderAuditReport(monthInput.value);
  if (csv) csv.onclick = () => exportAuditCSV();
};

const handleTuChange = async (sel) => {
  const uid = sel.dataset.u;
  const person = state.people.find(p => String(p.id) === String(uid));
  const val = Number(sel.value);
  if (val === person.turno_id) return;
  const ok = await openPasswordConfirm("Mover operacional",
    `Mover o nº ${person.numero_operacional} para outro turno? A chefia dos turnos afetados será normalizada.`, "Mover");
  if (!ok) { await renderCordasTurnos(); return; }
  const patch = person.role === "chefe_turno" ? { turno_id: val, role: "operacional" } : { turno_id: val };
  const { error } = await db.from("profiles").update(patch).eq("id", uid);
  if (error) { await renderCordasTurnos(); return M("tum", error.message); }
  await db.rpc("fn_normalizar_chefia_turno", { v_turno: person.turno_id });
  await db.rpc("fn_normalizar_chefia_turno", { v_turno: val });
  invalidatePeople();
  await renderCordasTurnos();
  M("tum", "Mudança aplicada.", "ok");
};

const syncOpExt = () => {
  const on = $("opExt").checked;
  $("opQuartelWrap").classList.toggle("hide", !on);
};

const openImportModal = async () => new Promise(resolve => {
  const modal = $("importModal");
  loadTurnos().then(ts => { $("importSel").innerHTML = ts.map(t => `<option value="${t.id}">${escape(t.nome)}</option>`).join(""); });
  const done = (v) => { modal.classList.add("hide"); resolve(v); };
  $("importOk").onclick = () => done(Number($("importSel").value));
  $("importClose").onclick = () => done(null);
  modal.onclick = (e) => { if (e.target === modal) done(null); };
  modal.classList.remove("hide");
});

const handleAuditReactivate = async (btn) => {
  const uid = btn.dataset.u;
  const p = state.people.find(x => String(x.id) === String(uid));
  if (!p) return M("gm", "Perfil não encontrado.");
  if (p.ativo !== false) return M("gm", "Este operacional já está ativo.");
  const clash = state.people.find(x => x.ativo !== false && String(x.numero_operacional) === String(p.numero_operacional) && String(x.id) !== uid);
  if (clash) return M("gm", `O nº ${p.numero_operacional} já está em uso — altera primeiro o número de um dos dois.`);
  const ok = await openPasswordConfirm("Reativar operacional", `Reativar o nº ${p.numero_operacional} com os dados antigos?`, "Reativar");
  if (!ok) return;
  const { error } = await db.from("profiles").update({ ativo: true }).eq("id", uid);
  if (error) return M("gm", error.message);
  invalidatePeople();
  toast(`nº ${p.numero_operacional} reativado.`, "ok", 5000);
  await applyAuditFilters();
};

const handleAuditDelete = async (btn) => {
  const id = btn.dataset.i;
  const ok = await openPasswordConfirm("Eliminar registo", "Eliminar este registo? A ação fica registada na auditoria.", "Eliminar");
  if (!ok) return;
  const numeric = /^\d+$/.test(id);
  const { error } = await db.from("registos").delete().eq("id", numeric ? Number(id) : id);
  if (error) return M("gm", error.message);
  toast("Registo eliminado.", "ok");
  invalidateAllRegs(); invalidateMyRegs();
  await loadLatestAll(true);
  await applyAuditFilters();
  if (panelVisible("team")) renderTeam();
  if (panelVisible("reg")) renderMine();
};

const handleAddOperacional = async () => {
  const numero = $("opNum").value.trim().replace(/\D/g, "");
  const externo = $("opExt").checked;
  const turno = Number($("opTurno").value) || null;
  if (numero.length < 1 || numero.length > 4) return M("tum", "Indica um número operacional entre 1 e 4 algarismos.");
  if (state.people.some(p => p.ativo && String(p.numero_operacional) === numero)) return M("tum", "Esse número operacional já está em uso.");
  const email = $("opEmail").value.trim().toLowerCase();
  if (!email || !email.includes("@")) return M("tum", "Indica um e-mail válido.");
  if (!EMAIL_CIDADE.test(email)) return M("tum", "Só são aceites e-mails @cm-lisboa.pt.");
  const existente = state.people.find(p => String(p.email || "").toLowerCase() === email);
  if (existente && existente.ativo !== false) return M("tum", "Esse e-mail já pertence a um utilizador ativo.");
  let msg;
  if (existente) {
    // REATIVAR: mesmo e-mail = mesma pessoa; mantém o histórico, muda número/turno
    const destino = externo ? `externo (${ $("opQuartel").value.trim() || "sem quartel" })` : `operacional do T${turno || "—"}`;
    const ok = await openPasswordConfirm("Reativar utilizador",
      `Este e-mail já existe (nº antigo ${existente.numero_operacional || "—"}, desativado). Reativar como ${destino} com o nº ${numero}? O histórico antigo mantém-se.`,
      "Reativar");
    if (!ok) return;
    const patch = externo
      ? { ativo: true, role: "externo", numero_operacional: numero, turno_id: null, veio_cid: false, quartel: $("opQuartel").value.trim() || null }
      : { ativo: true, role: "operacional", numero_operacional: numero, turno_id: turno, veio_cid: false };
    const { error } = await db.from("profiles").update(patch).eq("id", existente.id);
    if (error) return M("tum", error.message);
    msg = `nº ${numero} reativado — histórico mantido.`;
  } else if (externo) {
    const quartel = $("opQuartel").value.trim();
    if (!quartel) return M("tum", "Indica o quartel de origem.");
    const tName = turno ? ((await loadTurnos()).find(t => t.id === turno)?.nome || String(turno)) : null;
    const ok = await openPasswordConfirm("Registar externo",
      `Criar o externo nº ${numero} (${quartel}${tName ? " · " + tName : ""})? Sem acesso à app até ser importado para a CID.`, "Criar");
    if (!ok) return;
    const { error } = await signupOperacional({ numero, email, externo: true, quartel, turnoOrigem: tName, sendLink: false });
    if (error) return M("tum", error.message);
    msg = `Externo nº ${numero} registado.`;
  } else {
    if (!turno) return M("tum", "Seleciona o turno.");
    const ok = await openPasswordConfirm("Registar operacional",
      `Criar o operacional nº ${numero}? Ele recebe por e-mail o link para definir a palavra-passe.`, "Criar");
    if (!ok) return;
    const { error } = await signupOperacional({ numero, email, turno, sendLink: true });
    if (error) return M("tum", error.message);
    msg = `Operacional nº ${numero} registado. Link de primeiro acesso enviado para ${email}.`;
  }
  invalidatePeople();
  await renderCordasTurnos();
  $("opNum").value = ""; $("opEmail").value = ""; $("opQuartel").value = "";
  M("tum", msg, "ok");
  toast(msg, "ok", 6000);
};

const openPosModal = (label) => new Promise(resolve => {
  const lbl = $("posModalLabel");
  if (lbl) lbl.textContent = label ? `Posição de ${label}:` : "Seleciona a posição em que treinaste:";
  $("posModal").classList.remove("hide");
  const handler = (e) => {
    const btn = e.target.closest(".pos-option");
    if (btn) {
      $("posModal").classList.add("hide");
      document.removeEventListener("click", handler, true);
      resolve(Number(btn.dataset.pos));
    }
  };
  document.addEventListener("click", handler, true);
  $("posModalClose").onclick = () => { $("posModal").classList.add("hide"); resolve(null); };
});

const bindPosModal = () => {
  $("posModalClose").onclick = () => $("posModal").classList.add("hide");
  $("posModal").onclick = (e) => { if (e.target === $("posModal")) $("posModal").classList.add("hide"); };
};

const openTextModal = (title, current) => new Promise(resolve => {
  const modal = $("textModal"); const input = $("textModalInput");
  $("textModalTitle").textContent = title;
  input.value = current || "";
  input.placeholder = title;
  const done = (v) => { modal.classList.add("hide"); resolve(v); };
  $("textModalOk").onclick = () => done(input.value);
  $("textModalClose").onclick = () => done(undefined);
  modal.onclick = (e) => { if (e.target === modal) done(undefined); };
  modal.classList.remove("hide");
  setTimeout(() => input.focus(), 50);
});

const openCursoModal = (key, current, opts = {}) => new Promise(resolve => {
  const modal = $("cursoModal"); const input = $("cursoModalInput");
  $("cursoModalTitle").textContent = "Curso " + key.replace("curso_", "").toUpperCase();
  input.value = current || "";
  input.min = opts.min || "";
  input.max = opts.max || "";
  const done = (v) => { modal.classList.add("hide"); resolve(v); };
  $("cursoModalOk").onclick = () => done(input.value);
  $("cursoModalClose").onclick = () => done(undefined);
  modal.onclick = (e) => { if (e.target === modal) done(undefined); };
  modal.classList.remove("hide");
  setTimeout(() => input.focus(), 50);
});

const handleCursoEdit = async (btn) => {
  const p = personF(state.fichaUser);
  if (!p) return;
  const key = btn.dataset.c;
  // Limites no seletor: RA/RT nunca antes do RU; RU nunca depois de RA/RT
  const opts = {};
  if (key !== "curso_ru" && p.curso_ru) opts.min = p.curso_ru;
  if (key === "curso_ru") {
    const limites = [p.curso_ra, p.curso_rt].filter(Boolean).sort();
    if (limites.length) opts.max = limites[0];
  }
  const val = await openCursoModal(key, p[key] || null, opts);
  if (val === undefined) return;
  const novo = val || null;
  if (novo === (p[key] || null)) return;
  // REGRA 1: RA/RT só se definem pela primeira vez com RU preenchido
  if (novo && key !== "curso_ru" && !p.curso_ru && !p[key]) {
    return M("tum", "Regista primeiro o curso RU — RA e RT exigem RU.", "e");
  }
  // REGRA 2: datas de RA/RT nunca podem ser anteriores ao RU
  if (novo && key !== "curso_ru" && p.curso_ru && novo < p.curso_ru) {
    return M("tum", `A data não pode ser anterior ao RU (${formatDate(p.curso_ru)}).`, "e");
  }
  // REGRA 3: o RU não pode ficar posterior a RA/RT já existentes
  if (novo && key === "curso_ru") {
    const atrasados = [];
    if (p.curso_ra && p.curso_ra < novo) atrasados.push("RA");
    if (p.curso_rt && p.curso_rt < novo) atrasados.push("RT");
    if (atrasados.length) {
      return M("tum", `O RU não pode ficar posterior a ${atrasados.join(" e ")}. Atualiza primeiro ${atrasados.join(" e ")}.`, "e");
    }
  }
  const { error } = await updatePerson(p.id, { [key]: novo });
  if (error) return M("tum", error.message);
  if (key === "curso_rt") {
  await loadSpecialAssignments(true);
  if (!novo && p.so_teleferico) {
    await db.from("profiles").update({ so_teleferico: false }).eq("id", p.id);
  }
}
  invalidatePeople();
  await renderOperacionalFicha(p.id);
  M("tum", (key === "curso_rt" && novo)
    ? (p.externo ? "Curso RT registado." : "Curso RT registado — operacional atribuído ao teleférico.")
    : "Curso atualizado.", "ok");
};

const openNumModal = (current) => new Promise(resolve => {
  const modal = $("numModal"); const input = $("numModalInput");
  input.value = current || "";
  input.placeholder = "Novo número operacional";
  const done = (val) => { modal.classList.add("hide"); resolve(val); };
  const ok = () => done(input.value.trim());
  const cancel = () => done(null);
  $("numModalOk").onclick = ok;
  $("numModalClose").onclick = cancel;
  modal.onclick = (e) => { if (e.target === modal) cancel(); };
  input.onkeydown = (e) => { if (e.key === "Enter") ok(); };
  modal.classList.remove("hide");
  setTimeout(() => input.focus(), 50);
});

const personF = (id) => state.people.find(p => String(p.id) === String(id));
const updatePerson = async (id, patch) => {
  const p = personF(id);
  if (!p) return { error: { message: "Pessoa não encontrada." } };
  return db.from("profiles").update(patch).eq("id", id);
};
const posTxt = (pos) => pos === 3 ? "T" : pos === 4 ? "VE" : String(pos);

const handleTelePosReg = async (btn) => {
  const uid = btn.dataset.u; const pos = Number(btn.dataset.pos);
  const p = state.people.find(x => String(x.id) === String(uid));
  if (!p) return;
  const teleMove = state.moves.find(m => isSpecialMove(m));
  if (!teleMove) return;
  const ok = await openConfirm({ title: "Registar posição", message: `Registar a posição ${posTxt(pos)} para o nº ${p.numero_operacional} hoje?`, confirmLabel: "Registar" });
  if (!ok) return;
  const res = await insertRecords([{ user_id: uid, manobra_id: teleMove.id, realizado_em: localDateKey(), posicao: pos }]);
  if (res.error) return toast(res.error.message, "err");
  if (!res.inserted) return toast("Esta posição já está registada hoje.", "info");
  if (!state.telePosData) state.telePosData = new Map();
  state.telePosData.set(`${uid}-${pos}`, localDateKey());
  invalidateAllRegs();
  await loadLatestAll(true);
  renderOverview();
  toast("Posição registada.", "ok");
};

const handleRegPosExterno = async (btn) => {
  const p = personF(state.fichaUser);
  if (!p || p.role !== "externo" || p.turno_id) return;
  const pos = Number(btn.dataset.pos);
  const teleMove = state.moves.find(m => isSpecialMove(m));
  if (!teleMove) return;
  const ok = await openConfirm({ title: "Registar posição", message: `Registar a posição ${posTxt(pos)} para o nº ${p.numero_operacional} hoje?`, confirmLabel: "Registar" });
  if (!ok) return;
  const res = await insertRecords([{ user_id: p.id, manobra_id: teleMove.id, realizado_em: localDateKey(), posicao: pos }]);
  if (res.error) return M("tum", res.error.message);
  if (!res.inserted) return M("tum", "Esta posição já está registada hoje.", "ok");
  if (!state.telePosData) state.telePosData = new Map();
  state.telePosData.set(`${p.id}-${pos}`, localDateKey());
  invalidateAllRegs(); invalidateMyRegs();
  await loadLatestAll(true);
  await renderOperacionalFicha(p.id);
  state.telePosData.set(`${p.id}-${pos}`, localDateKey());
  if (panelVisible("team")) renderTeam();
  M("tum", "Posição registada.", "ok");
};

const buildOrigemModal = () => {
  if ($("origemModal")) return;
  const wrap = document.createElement("div");
  wrap.id = "origemModal";
  wrap.style.cssText = "position:fixed;inset:0;background:rgba(11,37,64,.45);display:none;align-items:center;justify-content:center;z-index:1200;padding:16px";
  wrap.innerHTML = `
    <div style="background:var(--white);border-radius:14px;padding:16px;width:100%;max-width:340px;box-shadow:var(--shadow-soft)">
      <h3 style="margin:0 0 10px;color:var(--navy)">Turno</h3>
      <div class="field"><label>Turno<select id="origemSel"></select></label></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
        <button id="origemCancel" class="secondary" type="button">Cancelar</button>
        <button id="origemOk" class="primary" type="button">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.style.display = "none"; });
  $("origemCancel").onclick = () => { wrap.style.display = "none"; };
};

const handleTurnoOrigem = async () => {
  const p = personF(state.fichaUser);
  if (!p || p.role !== "externo") return;
  const turnos = await loadTurnos();
  buildOrigemModal();
  const sel = $("origemSel");
  sel.innerHTML = `<option value="">Selecionar turno</option>` +
    turnos.map(t => `<option value="${t.id}">${escape(t.nome)}</option>`).join("");
  const atual = turnos.find(t => t.nome === (p.turno_origem || ""));
  sel.value = atual ? String(atual.id) : "";
  $("origemModal").style.display = "flex";
  $("origemOk").onclick = async () => {
    const t = turnos.find(x => x.id === Number(sel.value));
    if (!t) return M("tum", "Seleciona um turno.");
    $("origemModal").style.display = "none";
    const { error } = await updatePerson(p.id, { turno_origem: t.nome });
    if (error) return M("tum", error.message);
    invalidatePeople();
    await renderOperacionalFicha(p.id);
    M("tum", `Turno ${t.nome} associado ao externo.`, "ok");
  };
};

const handleImportCID = async () => {
  const p = personF(state.fichaUser);
  if (!p || p.role !== "externo") return;
  const val = await openImportModal();
  if (!val) return;
  const turnos = await loadTurnos();
  const t = turnos.find(x => x.id === val);
  if (!t) return M("tum", "Turno inválido.");
  const ok = await openPasswordConfirm("Importar para a CID",
    `O nº ${p.numero_operacional} passa a operacional de ${t.nome} e recebe o link de primeiro acesso por e-mail.`,
    "Importar");
  if (!ok) return;
  const { error } = await db.from("profiles").update({ turno_id: t.id, veio_cid: true, role: "operacional" }).eq("id", p.id);
  if (error) return M("tum", error.message);
  if (p.email) await sendFirstAccessLink(p.email);
  invalidatePeople();
  await renderOperacionalFicha(p.id);
  M("tum", `Importado para ${t.nome}. Link de primeiro acesso enviado.`, "ok");
};
const handleRemoverCID = async () => {
  const p = personF(state.fichaUser);
  if (!p || p.role !== "externo") return;
  const tAntes = p.turno_id;
  const ok = await openPasswordConfirm("Remover da CID",
    `O nº ${p.numero_operacional} deixa de pertencer à CID e volta a ser externo puro.`,
    "Remover");
  if (!ok) return;
  const { error } = await db.from("profiles").update({ turno_id: null, veio_cid: false, gestor: false }).eq("id", p.id);
  if (error) return M("tum", error.message);
  await normalizarChefiaTurno(tAntes);
  invalidatePeople();
  await renderOperacionalFicha(p.id);
  M("tum", "Removido da CID.", "ok");
};

const openExternoModal = async () => new Promise(resolve => {
  const modal = $("externoModal");
  loadTurnos().then(ts => {
    $("externoSel").innerHTML = '<option value="">Selecionar turno de destino</option>' +
      ts.map(t => `<option value="${t.id}">${escape(t.nome)}</option>`).join("");
  });
  $("externoQuartel").value = "";
  $("externoMsg").className = "msg"; $("externoMsg").textContent = "";
  const done = (v) => { modal.classList.add("hide"); resolve(v); };
  $("externoOk").onclick = () => {
    const quartel = $("externoQuartel").value.trim();
    if (!quartel) { $("externoMsg").className = "msg e"; $("externoMsg").textContent = "Indica o quartel de destino."; return; }
    done({ turno: Number($("externoSel").value) || null, quartel });
  };
  modal.onclick = (e) => { if (e.target === modal) done(null); };
  modal.classList.remove("hide");
});

const handleTornarExterno = async () => {
  const p = personF(state.fichaUser);
  if (!p || p.role === "externo") return;
  const tAntes = p.turno_id;
  const val = await openExternoModal();
  if (!val) return;
  const turnos = await loadTurnos();
  const t = turnos.find(x => x.id === val.turno);
  const ok = await openPasswordConfirm("Tornar externo",
    `O nº ${p.numero_operacional} sai da CID e passa a externo (${val.quartel}${t ? " · " + t.nome : ""}). Perde automaticamente o acesso à Gestão.`,
    "Tornar externo");
  if (!ok) return;
  const { error } = await db.from("profiles").update({
    role: "externo", quartel: val.quartel, turno_origem: t ? t.nome : null,
    turno_id: null, veio_cid: false, gestor: false
  }).eq("id", p.id);
  if (error) return M("tum", error.message);
  await normalizarChefiaTurno(tAntes);
  invalidatePeople(); await renderCordasTurnos();
  M("tum", "Convertido em externo.", "ok");
};

const handleFichaRenumber = async () => {
  const p = state.people.find(x => String(x.id) === String(state.fichaUser));
  if (!p) return;
  const novo = await openNumModal(p.numero_operacional);
  if (!novo) return;
  const num = novo.replace(/\D/g, "");
  if (num.length < 1 || num.length > 4) return M("tum", "Indica um número entre 1 e 4 algarismos.");
  if (num === String(p.numero_operacional || "")) return M("tum", "O número já é esse.", "ok");
  const { data: livre } = await db.rpc("fn_numero_disponivel", { p_numero: num });
  if (livre === false) return M("tum", "Esse número já está em uso.");
  const ok = await openPasswordConfirm("Alterar número", `Alterar o nº ${p.numero_operacional} para ${num}?`, "Alterar");
  if (!ok) return;
  const { error } = await updatePerson(p.id, { numero_operacional: num });
  if (error) return M("tum", error.message);
  invalidatePeople();
  await renderOperacionalFicha(p.id);
  M("tum", "Número atualizado.", "ok");
};

const handleFichaDesativar = async () => {
  const p = personF(state.fichaUser);
  if (!p) return;
  const tAntes = p.turno_id;
  if (String(p.id) === String(state.user.id)) return M("tum", "Não podes desativar a tua própria conta aqui.");
  const msg = p.role === "externo"
    ? `${p.numero_operacional || "—"} ficará desativado e sai das vistas da app.`
    : `${p.numero_operacional || "—"} ficará desativado. O histórico mantém-se e pode ser reativado ao voltar a entrar.`;
  const ok = await openPasswordConfirm("Desativar operacional", msg, "Desativar");
  if (!ok) return;
  const { error } = await updatePerson(p.id, { ativo: false, gestor: false });
  if (error) return M("tum", error.message);
  await normalizarChefiaTurno(tAntes);
  invalidatePeople();
  await renderCordasTurnos();
  M("tum", `${p.numero_operacional} desativado.`, "ok");
  toast(`${p.numero_operacional} desativado.`, "ok");
};

const openTurnoModal = async () => {
  const turnos = await loadTurnos();
  const p = state.people.find(x => String(x.id) === String(state.fichaUser));
  if (!p) return;
  $("turnoModalSel").innerHTML = turnos.filter(t => t.id !== p.turno_id).map(t => `<option value="${t.id}">${escape(t.nome)}</option>`).join("");
  $("turnoModal").classList.remove("hide");
};

const bindTurnoModal = () => {
  $("turnoModalClose").onclick = () => $("turnoModal").classList.add("hide");
  $("turnoModal").onclick = (e) => { if (e.target === $("turnoModal")) $("turnoModal").classList.add("hide"); };
  $("turnoModalOk").onclick = async () => {
    const p = state.people.find(x => String(x.id) === String(state.fichaUser));
    const val = Number($("turnoModalSel").value);
    if (!p || !val || val === p.turno_id) return;
    $("turnoModal").classList.add("hide");
    const ok = await openPasswordConfirm("Trocar de turno",
      `Mover o nº ${p.numero_operacional} para o turno ${val}? Perde automaticamente o acesso à Gestão.`, "Trocar");
    if (!ok) return;
    const patch = p.role === "chefe_turno" ? { turno_id: val, role: "operacional", gestor: false } : { turno_id: val, gestor: false };
    const { error } = await db.from("profiles").update(patch).eq("id", p.id);
    if (error) return M("tum", error.message);
    await normalizarChefiaTurno(p.turno_id);
    await normalizarChefiaTurno(val);
    invalidatePeople();
    await renderOperacionalFicha(p.id);
    M("tum", "Turno atualizado.", "ok");
  };
};

const pendingPw = () => localStorage.getItem("cid_pending_pw");
const setPendingPw = (id) => localStorage.setItem("cid_pending_pw", String(id));
const clearPendingPw = () => localStorage.removeItem("cid_pending_pw");
const isRecoveryUrl = () => /type=recovery/.test(location.hash) || /type=recovery/.test(location.search);

const bindAuthState = () => {
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session?.user) {
      setPendingPw(session.user.id);
      showFirstAccess();
      return;
    }
    if (flags.signupInProgress) return;
    if (session?.user && !state.user) {
      if (isRecoveryUrl() || pendingPw() === String(session.user.id)) {
        setPendingPw(session.user.id);
        showFirstAccess();
      } else start();
    } else if (!session && state.user) resetAuth();
  });
};

const showFirstAccess = () => {
  $("login").classList.add("hide");
  $("firstAccess").classList.remove("hide");
  M("am", "");
};

const bindFirstAccess = () => {
  // Recuperação pública removida — o reenvio de link é feito pelo Chefe das Cordas ("Reenviar link" na ficha).
  $("faForm").onsubmit = async (e) => {
    e.preventDefault();
    const pass = $("faPass").value;
    if (pass.length < 6) return M("fam", "A palavra-passe deve ter pelo menos 6 caracteres.");
    const { error } = await db.auth.updateUser({ password: pass });
    if (error) return M("fam", error.message);
    clearPendingPw();
    history.replaceState(null, "", location.pathname + location.search);
    $("firstAccess").classList.add("hide");
    M("am", "Palavra-passe definida. A entrar…", "ok");
    await start();
  };
};

const normalizarChefiaTurno = async (turnoId) => {
  if (!turnoId) return;
  invalidatePeople();
  const membros = (await loadPeople(true)).filter(p => p.turno_id === turnoId && p.ativo && p.role !== "chefe_cordas");
  if (membros.some(p => p.role === "chefe_turno") || !membros.length) return;
  const alvo = [...membros].sort((a, b) => Number(a.numero_operacional || 0) - Number(b.numero_operacional || 0))[0];
  const { error } = await db.from("profiles").update({ role: "chefe_turno" }).eq("id", alvo.id);
  if (error) return;
  invalidatePeople();
  toast(`T${turnoId} sem chefe: nº ${alvo.numero_operacional} promovido a Chefe de turno.`, "ok", 6000);
};

const handleTornarChefeTurno = async () => {
  const p = personF(state.fichaUser);
  if (!p || p.ativo === false || p.role !== "operacional" || !isCordas()) return;
  const ok = await openConfirm({
    title: "Tornar chefe de turno",
    message: `O nº ${p.numero_operacional} passa a Chefe de turno T${p.turno_id}. O chefe atual passa a operacional.`,
    confirmLabel: "Tornar chefe"
  });
  if (!ok) return;
  await db.from("profiles").update({ role: "operacional" }).eq("turno_id", p.turno_id).eq("role", "chefe_turno");
  const { error } = await db.from("profiles").update({ role: "chefe_turno" }).eq("id", p.id);
  if (error) return M("tum", error.message);
  invalidatePeople();
  await renderOperacionalFicha(p.id);
  M("tum", `nº ${p.numero_operacional} é agora Chefe de turno T${p.turno_id}.`, "ok");
};

const handleToggleGestor = async (uid) => {
  const p = state.people.find(x => String(x.id) === String(uid));
  if (!p || p.role !== "operacional" || p.ativo === false) return;
  if (!isChefeTurno() || state.profile?.turno_id !== p.turno_id) return;
  const novo = !p.gestor;
  const { error } = await db.from("profiles").update({ gestor: novo }).eq("id", uid);
  if (error) return M("gm", error.message);
  p.gestor = novo;
  toast(novo ? `nº ${p.numero_operacional} agora tem acesso à Gestão.` : `nº ${p.numero_operacional} perdeu o acesso à Gestão.`, "ok", 5000);
  if (panelVisible("manage")) await refreshManage();
  if (panelVisible("tu")) await renderOperacionalFicha(uid);
};

const handleDeactivate = async (btn) => {
  const uid = btn.dataset.u;
  const p = state.people.find(x => String(x.id) === String(uid));
  if (!p || !isChief()) return;
  if (String(uid) === String(state.user.id)) return M("gm", "Não podes desativar a tua própria conta aqui.");
  const ok = await openPasswordConfirm("Desativar operacional",
    `${p.numero_operacional || "—"} ficará desativado e sai das vistas da app. O histórico mantém-se. Reativação: o cordas regista novamente o mesmo e-mail.`, "Desativar");
  if (!ok) return;
  const { error } = await db.from("profiles").update({ ativo: false }).eq("id", uid);
  if (error) return M("gm", error.message);
  await normalizarChefiaTurno(p.turno_id);
  invalidatePeople();
  await refreshManage();
  M("gm", `${p.numero_operacional} desativado.`, "ok");
};

const init = async () => {
  applyLegend();
  bindInfoPopovers();
  bindConfirmModal();
  bindFirstAccess();
  bindLogin();
  bindForms();
  bindDelegated();
  bindDetailsTransitions();
  bindSimpleModals();
  bindPasswordModal();
  bindTransferModal();
  bindKeyboardShortcuts();
  bindPullToRefresh();
  bindConnectivity();
  bindAudit();
  bindTurnoModal();
  bindPosModal();
  bindAuthState();
  registerSW();
  window.addEventListener("resize", () => requestAnimationFrame(syncTabGlide));

  const findDate = $("findDate"), customDate = $("customDate");
  if (findDate) findDate.max = localDateKey();
  if (customDate) { customDate.max = localDateKey(); customDate.required = false; }

  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    if (isRecoveryUrl() || pendingPw() === String(session.user.id)) {
      setPendingPw(session.user.id);
      showFirstAccess();
    } else start();
  }
};

init();
