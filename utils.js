/**
 * @module utils
 * Helpers puros: formatação, datas, escape, retry
 */

export const TELEFERICO_NAME = "Resgate em Teleférico";

export const VERDE_MAX_MONTHS = 2;
export const AMARELO_MAX_MONTHS = 5;
export const VERMELHO_MAX_MONTHS = 8;
export const NO_RECORD_MONTHS = 12;

export const VERDE_MAX_DAYS = Math.round(VERDE_MAX_MONTHS * 30.5);
export const AMARELO_MAX_DAYS = Math.round(AMARELO_MAX_MONTHS * 30.5);
export const VERMELHO_MAX_DAYS = Math.round(VERMELHO_MAX_MONTHS * 30.5);

export const FIND_PAGE = 25;
export const MINE_PAGE = 20;
export const FETCH_PAGE = 1000;
export const INSERT_CHUNK = 500;

export const escape = (x) => String(x ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[c]));

const pad = (n) => String(n).padStart(2, "0");

export const localDateKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const toDateKey = (value) => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dt = new Date(value);
  if (isNaN(dt)) return "";
  return localDateKey(dt);
};

export const parseDateKey = (key) => {
  const k = toDateKey(key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return new Date(NaN);
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** true se a data do registo é futura (inválida) */
export const isFutureRecord = (dt) => !!dt && toDateKey(dt) > localDateKey();

export const daysSince = (value) => {
  const dt = parseDateKey(value);
  if (isNaN(dt)) return NaN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - dt) / 86400000));
};

export const monthsSince = (value) => {
  const dt = parseDateKey(value);
  if (isNaN(dt)) return NO_RECORD_MONTHS;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dt > today) return 0;
  let months = (today.getFullYear() - dt.getFullYear()) * 12 + (today.getMonth() - dt.getMonth());
  if (today.getDate() < dt.getDate()) months--;
  return Math.max(0, months);
};

export const nextDateKey = (value) => {
  const dt = parseDateKey(value);
  if (isNaN(dt)) return "";
  dt.setDate(dt.getDate() + 1);
  return localDateKey(dt);
};

export const formatDate = (value) => {
  const k = toDateKey(value);
  if (!k) return "—";
  const [y, m, d] = k.split("-");
  return `${d}/${m}/${y}`;
};

export const estadoFromMonths = (months) => {
  if (months <= VERDE_MAX_MONTHS) return ["g", "dg"];
  if (months <= AMARELO_MAX_MONTHS) return ["y", "dy"];
  if (months <= VERMELHO_MAX_MONTHS) return ["r", "dr"];
  return ["k", "dk"];
};

export const estadoFromDays = (dias) => {
  if (Number.isNaN(dias)) return ["k", "dk"];
  if (dias <= VERDE_MAX_DAYS) return ["g", "dg"];
  if (dias <= AMARELO_MAX_DAYS) return ["y", "dy"];
  if (dias <= VERMELHO_MAX_DAYS) return ["r", "dr"];
  return ["k", "dk"];
};

/* ===== #4 + #2: base única de estado (meses), com datas futuras = preto ===== */

/** meses para efeitos de estado; sem registo ou data futura = 12 */
export const monthsForRecord = (dt) => {
  if (!dt) return NO_RECORD_MONTHS;
  if (isFutureRecord(dt)) return NO_RECORD_MONTHS;
  return monthsSince(dt);
};

/** dias para mostrar/média; sem registo ou data futura = 365 */
export const daysForRecord = (dt) => {
  if (!dt) return 365;
  if (isFutureRecord(dt)) return 365;
  const d = daysSince(dt);
  return Number.isNaN(d) ? 365 : d;
};

/** cor do par a partir do registo (base meses; futuro/ausente = preto) */
export const estadoFromRecord = (dt) => estadoFromMonths(monthsForRecord(dt));

export const statusOrder = (s) => {
  if (s === "g") return 0;
  if (s === "y") return 1;
  if (s === "r") return 2;
  return 3;
};

export const byName = (a, b) => String(a?.nome || "").localeCompare(String(b?.nome || ""));

export const normalizeId = (v) => {
  if (v === null || v === undefined || v === "") return v;
  const n = Number(v);
  return Number.isInteger(n) ? n : v;
};

export const chunks = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const withRetry = async (fn, { retries = 3, delay = 500 } = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, attempt)));
    }
  }
  throw lastError;
};

export const withTimeout = (promise, ms = 15000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout após ${ms}ms`)), ms);
    promise
      .then(v => { clearTimeout(timer); resolve(v); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
};

export const vibrate = (pattern = 10) => {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (_) {}
  }
};

export const isSpecialMove = (m) =>
  m && String(m.nome || "").trim().toLowerCase() === TELEFERICO_NAME.trim().toLowerCase();

/* ===== Histórico de cursos ===== */
export const cursoLabel = (tipo) => tipo === "ra" ? "RA" : tipo === "ru" ? "RU" : "RT";
export const ordenaHistorico = (arr) => [...arr].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
export const cursoAtivo = (hist) => {
  if (!hist || !hist.length) return null;
  return ordenaHistorico(hist)[0].data;
};

export const pairKey = (userId, manobraId) =>
  `${userId}::${String(manobraId)}`;
