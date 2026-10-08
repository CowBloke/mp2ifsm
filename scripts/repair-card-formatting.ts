/** Apply a reviewed before/after manifest, preserving history and FSRS states.
 * Dry-run by default; --apply requires a named administrator via REPAIR_ADMIN_EMAIL.
 * node --env-file=.env --conditions=react-server --import tsx scripts/repair-card-formatting.ts MANIFEST [--apply]
 */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { composerCarte } from "../src/lib/rendu";

type Content = { recto: string; verso: string };
type Change = { id: string; before: Content; after: Content };
const file = process.argv[2];
assert.ok(file, "Provide a reviewed repair manifest");
const changes: Change[] = JSON.parse(await readFile(file, "utf8"));
assert.equal(new Set(changes.map(c => c.id)).size, changes.length, "Duplicate card IDs");
for (const c of changes) {
  for (const s of [c.after.recto, c.after.verso]) assert.ok(s.trim().length && s.length <= 8000);
  {
    const composed = composerCarte(c.after.recto, c.after.verso);
    assert.ok(!/katex-error|color:#cc0000/.test(Object.values(composed).join("")), `Invalid TeX on card ${c.id}`);
  }
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("begin");
  const actor = process.env.REPAIR_ADMIN_EMAIL;
  const users = actor ? await client.query("select id from app_user where email=$1 and role='admin'", [actor]) : null;
  if (process.argv.includes("--apply")) assert.equal(users?.rowCount, 1, "REPAIR_ADMIN_EMAIL must name an administrator");
  const before = await client.query("select md5(coalesce(string_agg(row_to_json(s)::text, '' order by user_id,card_id),'')) hash from card_state s");
  for (const c of changes) {
    const card = await client.query("select recto,verso from card where id=$1 and deleted_at is null for update", [c.id]);
    assert.deepEqual(card.rows[0], c.before, `Card ${c.id} changed since the audit; refusing to overwrite it`);
  }
  if (process.argv.includes("--apply")) {
    const backup = `${file}.backup-${Date.now()}.json`;
    await writeFile(backup, JSON.stringify(changes), { mode: 0o600, flag: "wx" });
    for (const c of changes) {
      // Ensure even cards without a prior revision have a restorable preimage.
      await client.query(`insert into card_revision(card_id,recto,verso,edited_by,motif)
        values($1,$2,$3,$4,'Sauvegarde avant réparation automatique du formatage')`,
        [c.id, c.before.recto, c.before.verso, users!.rows[0].id]);
      await client.query("update card set recto=$2,verso=$3,updated_at=now() where id=$1", [c.id,c.after.recto,c.after.verso]);
      await client.query(`insert into card_revision(card_id,recto,verso,edited_by,motif)
        values($1,$2,$3,$4,'Réparation du formatage Anki/LaTeX après audit des cartes importées')`,
        [c.id,c.after.recto,c.after.verso,users!.rows[0].id]);
    }
    const after = await client.query("select md5(coalesce(string_agg(row_to_json(s)::text, '' order by user_id,card_id),'')) hash from card_state s");
    assert.equal(before.rows[0].hash, after.rows[0].hash, "FSRS states must stay unchanged");
    await client.query("commit");
    console.log(`Applied ${changes.length} repairs; history and FSRS preserved. Backup: ${backup}`);
  } else {
    await client.query("rollback");
    console.log(`Validated ${changes.length} repairs; dry-run, database unchanged.`);
  }
} catch (error) { await client.query("rollback"); throw error; }
finally { client.release(); await pool.end(); }
