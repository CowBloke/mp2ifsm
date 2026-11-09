// Toilet! de bout en bout, sur un schéma et un stockage jetables :
// aucune donnée de la classe n'est touchée.
//   NEXT_BUILD_DIR=.next-portal-check npm run build
//   node --env-file=.env --conditions=react-server --import tsx tests/toilet.integration.ts
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const schema = `toilet_test_${process.pid}`;
const stockage = await mkdtemp("/tmp/mp2-toilet-");
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("options", `-c search_path=${schema} -c timezone=Europe/Paris`);
process.env.DATABASE_URL = url.toString();
process.env.STORAGE_ROOT = stockage;
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:4263";
process.env.NEXT_BUILD_DIR = ".next-portal-check";
const { pool, query } = await import("../src/lib/db");

let serveur: ReturnType<typeof spawn> | undefined;
let logs = "";
let n = 0;
function ok(c: unknown, m: string) { assert.ok(c, m); n++; console.log(`PASS ${m}`); }

// PNG 1×1 valide.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

try {
  await admin.query(`create schema ${schema}`);
  for (const f of ["db/schema.sql", "db/functions.sql", "db/schema-portal.sql", "db/schema-proposals.sql",
                   "db/schema-etudes.sql", "db/schema-dossiers.sql", "db/schema-kcmaths.sql", "db/schema-toilet.sql"]) {
    await query(await readFile(f, "utf8"));
  }
  await query(await readFile("db/schema-toilet.sql", "utf8"));
  const [{ code }] = await query<{ code: string }>("select code_invitation as code from toilet_config");
  ok(/^[a-f0-9]{32}$/.test(code) && (await query("select 1 from toilet_config")).length === 1,
     "migration rejouable : un seul code aléatoire, jamais réécrit");

  const membres = await query<{ id: string }>(`insert into app_user (email, display_name, password_hash)
    values ('t-a@example.invalid','Test Alice','x'), ('t-b@example.invalid','Test Bob','x') returning id`);
  const cookies: string[] = [];
  for (const m of membres) {
    const tok = randomBytes(32).toString("base64url");
    await query("insert into user_session(token_hash,user_id,expires_at) values ($1,$2,now()+interval '1 hour')",
      [createHash("sha256").update(tok).digest(), m.id]);
    cookies.push(`mp2_session=${tok}`);
  }
  const [alice, bob] = cookies;

  serveur = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "4263", "-H", "127.0.0.1"],
    { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  serveur.stdout!.on("data", d => { logs += d; });
  serveur.stderr!.on("data", d => { logs += d; });
  const base = process.env.PUBLIC_ORIGIN!;
  let pret = false;
  for (let i = 0; i < 150 && !pret; i++) {
    try { pret = (await fetch(`${base}/connexion`)).ok; } catch {}
    if (!pret) await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(pret, logs);

  const get = (p: string, cookie = alice) => fetch(base + p, { headers: { cookie }, redirect: "manual" });
  const manifest = JSON.parse(await readFile(".next-portal-check/server/server-reference-manifest.json", "utf8"));
  async function action(nom: string, args: unknown[], cookie = alice) {
    const id = Object.entries(manifest.node).find(([, v]) => (v as { exportedName: string }).exportedName === nom)?.[0];
    assert.ok(id, nom);
    const res = await fetch(base + "/toilet", { method: "POST", headers: {
      cookie, origin: base, "next-action": id, "content-type": "text/plain;charset=UTF-8" }, body: JSON.stringify(args) });
    const ligne = (await res.text()).split("\n").find(l => /^\d+:\{"ok":/.test(l));
    assert.ok(ligne, nom);
    return JSON.parse(ligne.slice(ligne.indexOf(":") + 1));
  }
  async function passage(cookie: string, photo?: Buffer) {
    const fd = new FormData();
    if (photo) fd.set("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), "p.png");
    const res = await fetch(base + "/api/toilet/passage", { method: "POST", body: fd, headers: { cookie, origin: base } });
    return { status: res.status, body: await res.json() };
  }

  // Cachée tant que le lien n'a pas été ouvert.
  ok((await get("/toilet")).status === 404, "/toilet répond 404 avant activation");
  ok(!(await (await get("/divertissement")).text()).includes("Toilet!"), "aucune tuile avant activation");
  ok((await get(`/toilet/rejoindre/${"0".repeat(32)}`)).status === 404, "mauvais code : 404");
  ok((await passage(alice)).status === 404, "passage refusé avant activation");
  const invitation = await get(`/toilet/rejoindre/${code}`);
  ok(invitation.status === 200 && (await invitation.text()).includes("Entrer dans le petit coin"), "bon lien : écran d’entrée");
  ok((await get(`/toilet/rejoindre/${code}`, "")).status === 200, "lien ouvert déconnecté : invite à se connecter");

  ok((await action("activerToilet", ["f".repeat(32)])).ok === false, "activation refusée avec un faux code");
  ok((await action("activerToilet", [code])).ok === true, "activation avec le bon code");
  ok((await get("/toilet")).status === 200, "/toilet ouverte après activation");
  ok((await (await get("/divertissement")).text()).includes("Toilet!"), "tuile visible après activation");
  ok((await get(`/toilet/rejoindre/${code}`)).status === 307, "déjà membre : redirection vers /toilet");
  ok((await get("/toilet", bob)).status === 404, "toujours cachée pour Bob");

  // Passages.
  const p1 = await passage(alice);
  ok(p1.status === 200 && p1.body.total === 1, "premier passage sans photo");
  const p2 = await passage(alice);
  ok(p2.status === 400 && p2.body.erreur.includes("3 minutes"), "délai entre deux passages");
  await query("update toilet_passage set cree_le = cree_le - interval '10 minutes'");
  const p3 = await passage(alice, PNG);
  ok(p3.status === 200 && p3.body.total === 2, "deuxième passage avec photo");
  await query("update toilet_passage set cree_le = cree_le - interval '10 minutes'");
  const faux = await passage(alice, Buffer.from("pas une image du tout"));
  ok(faux.status === 400 && faux.body.erreur.includes("Type"), `photo non image refusée (${faux.status} ${JSON.stringify(faux.body)})`);
  ok((await readdir(`${stockage}/toilet-photos`)).length === 1, "un seul fichier sur disque");

  const photo = await get(`/api/toilet/photo/${p3.body.id}`);
  ok(photo.status === 200 && photo.headers.get("content-type") === "image/png"
     && Buffer.from(await photo.arrayBuffer()).equals(PNG), "photo servie aux membres");
  ok((await get(`/api/toilet/photo/${p3.body.id}`, bob)).status === 404, "photo cachée aux non-membres");
  ok((await get(`/api/toilet/photo/${p1.body.id}`)).status === 404, "passage sans photo : 404");

  const page = await (await get("/toilet?periode=total")).text();
  ok(page.includes("Premier jet") && page.includes("propreté prouvée") && page.includes("Test Alice"),
     "page : statut, fil et classement");

  ok((await action("supprimerPassage", [p3.body.id], bob)).ok === false, "Bob ne supprime rien");
  ok((await action("supprimerPassage", [p3.body.id])).ok === true, "Alice supprime son passage");
  ok((await readdir(`${stockage}/toilet-photos`)).length === 0, "la photo part avec le passage");
  console.log(`\n${n} vérifications Toilet! réussies`);
} finally {
  serveur?.kill();
  await pool.end();
  await admin.query(`drop schema if exists ${schema} cascade`);
  await admin.end();
  await rm(stockage, { recursive: true, force: true });
}
