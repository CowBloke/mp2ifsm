/*
 * Initialise une base mp2ifsm propre avec le compte administrateur.
 *
 *   ADMIN_PASSWORD=... DATABASE_URL=... node --experimental-strip-types scripts/seed.ts
 *   ... scripts/seed.ts --reset      (vide d'abord toutes les tables)
 *
 * Le mot de passe n'est jamais écrit dans le dépôt : il est fourni par la
 * variable d'environnement ADMIN_PASSWORD au moment de l'initialisation.
 */

import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scryptAsync = promisify(scrypt) as (
  motDePasse: string,
  sel: Buffer,
  longueur: number,
  options: { N: number },
) => Promise<Buffer>;

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
if (!DATABASE_URL) {
  console.error("DATABASE_URL manquant");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("ADMIN_PASSWORD manquant");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const reset = process.argv.includes("--reset");

async function hacher(mdp: string): Promise<string> {
  const sel = randomBytes(16);
  const cle = await scryptAsync(mdp, sel, 64, { N: 16384 });
  return `scrypt$16384$${sel.toString("hex")}$${cle.toString("hex")}`;
}

async function main() {
  const c = await pool.connect();
  try {
    if (reset) {
      await c.query(`truncate bet, external_deposit, withdrawal, ledger_entry,
                              ledger_transfer, outcome, market, user_session,
                              invite_code, account, app_user restart identity cascade`);
      await c.query(`insert into account (kind) values ('external')`);
      console.log("Tables vidées.");
    }

    await c.query(
      `insert into invite_code (code, max_uses) values ('MP2I-2026', 200)
       on conflict (code) do update set max_uses = excluded.max_uses`,
    );

    const passwordHash = await hacher(ADMIN_PASSWORD);
    const admin = await c.query(
      `insert into app_user (email, display_name, password_hash, role)
       values ('guilhem@mp2ifsm.com', 'guilhem', $1, 'admin')
       on conflict (lower(email)) do update
         set display_name = excluded.display_name,
             password_hash = excluded.password_hash,
             role = 'admin'
       returning email, display_name`,
      [passwordHash],
    );

    console.log(`Compte administrateur prêt : ${admin.rows[0].display_name} (${admin.rows[0].email})`);
    console.log("Code d’invitation : MP2I-2026");
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
