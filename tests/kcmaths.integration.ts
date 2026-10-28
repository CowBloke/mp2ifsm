// Isolated schema: no class data is changed. kcmaths.com is simulated in memory.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const schema = `kcmaths_test_${process.pid}`;
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("options", `-c search_path=${schema}`);
process.env.DATABASE_URL = url.toString();
process.env.KCMATHS_API_URL = "https://kcmaths.invalid/api/mp2ifsm.php";
process.env.KCMATHS_API_TOKEN = "test";
const { pool, query, queryOne } = await import("../src/lib/db");
const { demarrerTransfert, traiterTransfert } = await import("../src/lib/kcmaths");

/* Same rules as the PHP file sent to kcmaths: dedupe on ref, no overdraft. */
const soldesKc = new Map<string, number>([["eleve@example.invalid", 100]]);
const refsVues = new Set<string>();
let enPanne = false;
const kcmaths = (async (_url: string, init: RequestInit) => {
  if (enPanne) throw new TypeError("fetch failed");
  const { ref, email, delta } = JSON.parse(String(init.body));
  const solde = soldesKc.get(email);
  if (solde === undefined) return new Response("", { status: 404 });
  if (refsVues.has(ref)) return Response.json({ ok: true, solde });
  if (solde + delta < 0) return new Response(JSON.stringify({ ok: false }), { status: 409 });
  refsVues.add(ref);
  soldesKc.set(email, solde + delta);
  return Response.json({ ok: true, solde: solde + delta });
}) as typeof fetch;

let assertions = 0;
function ok(condition: unknown, message: string) { assert.ok(condition, message); assertions++; console.log(`PASS ${message}`); }

try {
  await admin.query(`create schema ${schema}`);
  for (const fichier of ["db/schema.sql", "db/functions.sql", "db/schema-kcmaths.sql"]) {
    await query(await readFile(fichier, "utf8"));
  }
  await query(`insert into account (kind) select 'external' where not exists (select 1 from account where kind = 'external')`);
  const [{ id: eleve }] = await query<{ id: string }>(`insert into app_user (email, display_name, password_hash)
    values ('eleve@example.invalid', 'Eleve Test', 'unused') returning id`);
  // Wallet in PCK (ledger hundredths / 100); transfers are whole KC, 1 KC = 1 PCK.
  const solde = async () => (await queryOne<{ s: number }>(`select wallet_balance($1::uuid) as s`, [eleve]))!.s / 100;
  const transferer = async (sens: "depot" | "retrait", montant: number, ref = randomUUID()) => {
    await demarrerTransfert(eleve, "eleve@example.invalid", sens, montant, ref);
    return { ref, ...(await traiterTransfert(ref, kcmaths)) };
  };

  const depot = await transferer("depot", 30);
  ok(depot.statut === "effectue" && (await solde()) === 30 && soldesKc.get("eleve@example.invalid") === 70,
    "deposit debits kcmaths then credits the ledger");

  await demarrerTransfert(eleve, "eleve@example.invalid", "depot", 30, depot.ref);
  await traiterTransfert(depot.ref, kcmaths);
  ok((await solde()) === 30 && soldesKc.get("eleve@example.invalid") === 70, "replaying a deposit ref moves nothing");

  const tropGros = await transferer("depot", 500);
  ok(tropGros.statut === "refuse" && tropGros.motif === "SOLDE_KC_INSUFFISANT" && (await solde()) === 30,
    "deposit beyond the kcmaths balance is refused without credit");

  const retrait = await transferer("retrait", 10);
  ok(retrait.statut === "effectue" && (await solde()) === 20 && soldesKc.get("eleve@example.invalid") === 80,
    "withdrawal debits the ledger then credits kcmaths");

  await assert.rejects(transferer("retrait", 999), /INSUFFICIENT_FUNDS/);
  ok((await solde()) === 20, "withdrawal beyond the wallet is refused by the ledger");

  enPanne = true;
  const coupe = await transferer("depot", 5);
  ok(coupe.statut === "en_attente" && (await solde()) === 20, "unreachable kcmaths leaves the deposit pending, uncredited");
  enPanne = false;
  const repris = await traiterTransfert(coupe.ref, kcmaths);
  ok(repris.statut === "effectue" && (await solde()) === 25 && soldesKc.get("eleve@example.invalid") === 75,
    "retrying the pending deposit completes it exactly once");

  soldesKc.delete("eleve@example.invalid");
  const orphelin = await transferer("retrait", 8);
  ok(orphelin.statut === "refuse" && (await solde()) === 25, "refused withdrawal is refunded to the wallet");

  await assert.rejects(demarrerTransfert(eleve, "eleve@example.invalid", "retrait", 9, depot.ref), /INVALID_TRANSFER/);
  ok(true, "a ref cannot be reused for a different transfer");

  await query(`select post_transfer('payout', 'test-fraction', external_account_id(), wallet_id($1::uuid), 37)`, [eleve]);
  await query(`insert into external_deposit (user_id, amount, source_ref, transfer_id)
    select $1::uuid, 37, 'test-fraction', id from ledger_transfer where idempotency_key = 'test-fraction'`, [eleve]);
  soldesKc.set("eleve@example.invalid", 0);
  await assert.rejects(transferer("retrait", 26), /INSUFFICIENT_FUNDS/);
  const entier = await transferer("retrait", 25);
  ok(entier.statut === "effectue" && Math.abs((await solde()) - 0.37) < 1e-9 && soldesKc.get("eleve@example.invalid") === 25,
    "a fractional balance withdraws whole KC and keeps the remainder");

  const net = await queryOne<{ interne: number; externe: number }>(`select
      (select coalesce(sum(e.amount),0) from ledger_entry e join account a on a.id = e.account_id where a.kind = 'user') as interne,
      (select coalesce(sum(amount),0) from external_deposit) - (select coalesce(sum(amount),0) from withdrawal) as externe`);
  ok(net!.interne === net!.externe, "wallets equal net external deposits after refunds");
  console.log(`${assertions} assertions passed`);
} finally {
  await pool.end();
  await admin.query(`drop schema if exists ${schema} cascade`);
  await admin.end();
}
