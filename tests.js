/**
 * @module tests
 * Testes unitários executáveis no browser
 * Para correr: abrir a app e executar no console:
 *   import("./tests.js").then(t => t.runAll())
 */
import {
  escape, localDateKey, toDateKey, parseDateKey, daysSince, monthsSince,
  nextDateKey, formatDate, estadoFromMonths, estadoFromDays, statusOrder,
  normalizeId, chunks, isSpecialMove, pairKey,
  VERDE_MAX_DAYS, AMARELO_MAX_DAYS, VERMELHO_MAX_DAYS,
  VERDE_MAX_MONTHS, AMARELO_MAX_MONTHS, VERMELHO_MAX_MONTHS
} from "./utils.js";

let passed = 0, failed = 0, errors = [];

const assert = (name, condition, detail = "") => {
  if (condition) {
    passed++;
    console.log(`✅ ${name}`);
  } else {
    failed++;
    errors.push({ name, detail });
    console.error(`❌ ${name} ${detail}`);
  }
};

const testEscape = () => {
  assert("escape: básico", escape("a<b>c") === "a&lt;b&gt;c");
  assert("escape: aspas", escape('"a"') === "&quot;a&quot;");
  assert("escape: ampersand", escape("a&b") === "a&amp;b");
  assert("escape: null", escape(null) === "");
  assert("escape: undefined", escape(undefined) === "");
  assert("escape: número", escape(123) === "123");
};

const testDates = () => {
  const today = localDateKey();
  assert("localDateKey: formato", /^\d{4}-\d{2}-\d{2}$/.test(today));
  assert("toDateKey: ISO string", toDateKey("2026-08-13") === "2026-08-13");
  assert("toDateKey: null", toDateKey(null) === "");
  assert("parseDateKey: válido", parseDateKey("2026-08-13").getFullYear() === 2026);
  assert("parseDateKey: inválido", isNaN(parseDateKey("xyz").getTime()));
  assert("nextDateKey: +1 dia", nextDateKey("2026-08-13") === "2026-08-14");
  assert("nextDateKey: fim do mês", nextDateKey("2026-08-31") === "2026-09-01");
  assert("formatDate: formatação", formatDate("2026-08-13") === "13/08/2026");
  assert("formatDate: vazio", formatDate("") === "—");
};

const testDays = () => {
  const today = localDateKey();
  assert("daysSince: hoje é 0", daysSince(today) === 0);
  assert("daysSince: inválido é NaN", isNaN(daysSince("xyz")));
};

const testEstado = () => {
  assert("estadoFromMonths: 0 = verde", estadoFromMonths(0)[0] === "g");
  assert("estadoFromMonths: 2 = verde", estadoFromMonths(2)[0] === "g");
  assert("estadoFromMonths: 3 = amarelo", estadoFromMonths(3)[0] === "y");
  assert("estadoFromMonths: 5 = amarelo", estadoFromMonths(5)[0] === "y");
  assert("estadoFromMonths: 6 = vermelho", estadoFromMonths(6)[0] === "r");
  assert("estadoFromMonths: 8 = vermelho", estadoFromMonths(8)[0] === "r");
  assert("estadoFromMonths: 9 = preto", estadoFromMonths(9)[0] === "k");

  assert("estadoFromDays: 0 = verde", estadoFromDays(0)[0] === "g");
  assert("estadoFromDays: 61 = verde", estadoFromDays(61)[0] === "g");
  assert("estadoFromDays: 62 = amarelo", estadoFromDays(62)[0] === "y");
  assert("estadoFromDays: 153 = amarelo", estadoFromDays(153)[0] === "y");
  assert("estadoFromDays: 154 = vermelho", estadoFromDays(154)[0] === "r");
  assert("estadoFromDays: 244 = vermelho", estadoFromDays(244)[0] === "r");
  assert("estadoFromDays: 245 = preto", estadoFromDays(245)[0] === "k");
  assert("estadoFromDays: NaN = preto", estadoFromDays(NaN)[0] === "k");

  // Consistência meses ↔ dias nos limites
  assert("Consistência limite verde", VERDE_MAX_DAYS === Math.round(VERDE_MAX_MONTHS * 30.5));
  assert("Consistência limite amarelo", AMARELO_MAX_DAYS === Math.round(AMARELO_MAX_MONTHS * 30.5));
  assert("Consistência limite vermelho", VERMELHO_MAX_DAYS === Math.round(VERMELHO_MAX_MONTHS * 30.5));
};

const testStatusOrder = () => {
  assert("statusOrder: verde < amarelo", statusOrder("g") < statusOrder("y"));
  assert("statusOrder: amarelo < vermelho", statusOrder("y") < statusOrder("r"));
  assert("statusOrder: vermelho < preto", statusOrder("r") < statusOrder("k"));
};

const testNormalizeId = () => {
  assert("normalizeId: número", normalizeId("123") === 123);
  assert("normalizeId: string não numérica", normalizeId("abc") === "abc");
  assert("normalizeId: null", normalizeId(null) === null);
  assert("normalizeId: vazio", normalizeId("") === "");
};

const testChunks = () => {
  assert("chunks: [1,2,3,4,5] em 2", JSON.stringify(chunks([1, 2, 3, 4, 5], 2)) === JSON.stringify([[1, 2], [3, 4], [5]]));
  assert("chunks: vazio", JSON.stringify(chunks([], 3)) === "[]");
  assert("chunks: maior que size", JSON.stringify(chunks([1], 5)) === "[[1]]");
};

const testSpecialMove = () => {
  assert("isSpecialMove: match exato", isSpecialMove({ nome: "Resgate em Teleférico" }));
  assert("isSpecialMove: case insensitive", isSpecialMove({ nome: "resgate em teleférico" }));
  assert("isSpecialMove: com espaços", isSpecialMove({ nome: "  Resgate em Teleférico  " }));
  assert("isSpecialMove: outra manobra", !isSpecialMove({ nome: "Outra" }));
  assert("isSpecialMove: null", !isSpecialMove(null));
};

const testPairKey = () => {
  assert("pairKey: formato", pairKey("abc", 123) === "abc::123");
  assert("pairKey: único", pairKey("a", 1) !== pairKey("a", 2));
  assert("pairKey: sem colisão com |", pairKey("a|b", 1) !== pairKey("a", "b|1"));
};

export const runAll = () => {
  console.group("🧪 Testes Unitários");
  console.log("=== Escape ==="); testEscape();
  console.log("=== Datas ==="); testDates();
  console.log("=== Dias ==="); testDays();
  console.log("=== Estado ==="); testEstado();
  console.log("=== Status Order ==="); testStatusOrder();
  console.log("=== Normalize ID ==="); testNormalizeId();
  console.log("=== Chunks ==="); testChunks();
  console.log("=== Special Move ==="); testSpecialMove();
  console.log("=== Pair Key ==="); testPairKey();
  console.groupEnd();
  console.log(`\n📊 Resultado: ${passed} ✅ · ${failed} ❌`);
  if (failed) console.table(errors);
  return { passed, failed, errors };
};

// Auto-run se aberto diretamente
if (typeof window !== "undefined") {
  window.__runTests = runAll;
  console.log("💡 Para correr os testes: window.__runTests()");
}
