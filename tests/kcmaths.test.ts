import assert from "node:assert/strict";
import test from "node:test";
import { appelerKcmaths } from "../src/lib/kcmaths";
import { formatCentimes, kcRetirables, parseKc, parseMontant } from "../src/lib/money";

const cfg = { url: "https://kcmaths.invalid/api/mp2ifsm.php", token: "t" };
const repondre = (status: number, corps: unknown = {}) =>
  (async () => new Response(JSON.stringify(corps), { status })) as typeof fetch;

test("kcmaths: only 400/404/409 are definitive refusals", async () => {
  assert.deepEqual(await appelerKcmaths(cfg, "r", "e", -5, repondre(200, { ok: true })), { statut: "ok" });
  assert.deepEqual(await appelerKcmaths(cfg, "r", "e", -5, repondre(409)), { statut: "refuse", motif: "SOLDE_KC_INSUFFISANT" });
  assert.deepEqual(await appelerKcmaths(cfg, "r", "e", -5, repondre(404)), { statut: "refuse", motif: "COMPTE_KC_INTROUVABLE" });
  for (const status of [401, 403, 500, 502]) {
    assert.equal((await appelerKcmaths(cfg, "r", "e", 5, repondre(status))).statut, "injoignable");
  }
  assert.equal((await appelerKcmaths(cfg, "r", "e", 5, repondre(200, { ok: false }))).statut, "injoignable");
  const panne = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  assert.equal((await appelerKcmaths(cfg, "r", "e", 5, panne)).statut, "injoignable");
});

test("kcmaths: request carries bearer token and signed delta", async () => {
  let vu: { auth: string | null; corps: unknown } | undefined;
  const espion = (async (_url: string, init: RequestInit) => {
    vu = { auth: new Headers(init.headers).get("authorization"), corps: JSON.parse(String(init.body)) };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  await appelerKcmaths(cfg, "abc", "eleve@example.invalid", -12, espion);
  assert.deepEqual(vu, { auth: "Bearer t", corps: { ref: "abc", email: "eleve@example.invalid", delta: -12 } });
});

test("pricoupenkoins are decimal, KC transfers are whole", () => {
  assert.equal(parseMontant("12,34"), 1234);
  assert.equal(parseMontant("0.5"), 50);
  assert.equal(parseMontant("1,234"), null);
  assert.equal(formatCentimes(1234).replace(/\s/g, " "), "12,34 PCK");
  assert.equal(parseKc("12"), 12);
  assert.equal(parseKc("12,5"), null);
  assert.equal(parseKc("0"), null);
  assert.equal(kcRetirables(1299), 12);
  assert.equal(kcRetirables(99), 0);
});
