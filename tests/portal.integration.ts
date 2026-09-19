// Isolated schema + storage: no class data is changed by this suite.
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import pg from "pg";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const schema = `portal_test_${process.pid}`;
const stockage = await mkdtemp("/tmp/mp2-portal-");
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("options", `-c search_path=${schema} -c timezone=Europe/Paris`);
process.env.DATABASE_URL = url.toString();
process.env.STORAGE_ROOT = stockage;
process.env.QUOTA_UTILISATEUR = "1000";
process.env.QUOTA_GLOBAL = "1800";
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:4261";
process.env.NEXT_BUILD_DIR = ".next-portal-check";
const { pool, query, tx } = await import("../src/lib/db");
const { statsPaquet, heatmapClasse, prochaineCarte, listerPaquets } = await import("../src/lib/fiches");
const { purgerDocuments } = await import("../src/lib/purge");
const { jetonRevision } = await import("../src/lib/revision-token");
const { ecrireApkg, lireApkg } = await import("../src/lib/anki");
let serveur: ReturnType<typeof spawn> | undefined;
let logs = "";
let assertions = 0;
function ok(condition: unknown, message: string) { assert.ok(condition, message); assertions++; console.log(`PASS ${message}`); }
try {
  await admin.query(`create schema ${schema}`);
  for (const fichier of ["db/schema.sql", "db/functions.sql", "db/schema-portal.sql", "db/schema-proposals.sql"]) {
    await query(await readFile(fichier, "utf8"));
  }
  const membres = await query<{ id: string }>(`insert into app_user (email, display_name, password_hash, partage_stats)
    values ('test-a@example.invalid','Test Alice','unused',true),
           ('test-b@example.invalid','Test Bob','unused',false) returning id`);
  const [alice, bob] = membres.map(m => m.id);
  const token = randomBytes(32).toString("base64url");
  const tokenBob = randomBytes(32).toString("base64url");
  for (const [uid, tok] of [[alice, token], [bob, tokenBob]]) {
    await query("insert into user_session(token_hash,user_id,expires_at) values ($1,$2,now()+interval '1 hour')", [createHash("sha256").update(tok).digest(), uid]);
  }
  const [deck] = await query<{ id: number }>(`insert into deck(slug,titre,matiere,chapitre,created_by)
    values ('integration','Intégration','Maths','Analyse',$1) returning id`, [alice]);
  const [card] = await query<{ id: number }>(`insert into card(deck_id,recto,verso,author_id)
    values ($1,'Dérivée de $x^2$','$2x$',$2) returning id`, [deck.id, alice]);
  const first = await prochaineCarte(alice, deck.id);
  ok(first?.apercu.length === 4, "first card returns four server intervals");
  ok((await statsPaquet(deck.id, alice)).a_venir.length === 7, "empty forecast retains all seven days");
  serveur = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "4261", "-H", "127.0.0.1"], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  serveur.stdout!.on("data", d => { logs += d; });
  serveur.stderr!.on("data", d => { logs += d; });
  const base = process.env.PUBLIC_ORIGIN;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/connexion`)).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, logs);
  const auth = { cookie: `mp2_session=${token}` };
  const manifest = JSON.parse(await readFile(".next-portal-check/server/server-reference-manifest.json", "utf8"));
  async function action(name: string, args: unknown[], cookie = auth.cookie) {
    const found = Object.entries(manifest.node).find(([, v]) => (v as { exportedName: string }).exportedName === name);
    assert.ok(found, name);
    const res = await fetch(base + "/fiches/integration", { method: "POST", headers: {
      cookie, origin: base, "next-action": found[0], "content-type": "text/plain;charset=UTF-8",
    }, body: JSON.stringify(args) });
    const body = await res.text();
    const result = body.split("\n").find(l => /^\d+:\{"ok":/.test(l));
    assert.ok(result, `${name}: ${res.status} ${body.slice(0, 500)}`);
    return JSON.parse(result.slice(result.indexOf(":") + 1));
  }
  for (const path of ["/", "/fiches", "/fiches/integration", "/fiches/integration/reviser", "/documents", "/profil", "/marche", "/marche/classement"]) {
    const r = await fetch(base + path, { headers: auth });
    const html = await r.text();
    ok(r.ok && !html.includes('"digest":'), `authenticated page ${path}`);
  }
  const { submitProposal } = await import("../src/lib/proposals");
  const suggestion = { question: 'Un pari amusant pour vendredi ?', description: 'Résultat annoncé en classe.', closesAt: new Date(Date.now()+86400000).toISOString(), issues: ['Oui','Non'] };
  ok((await action("proposerPari", [suggestion])).ok, "member submits a proposal");
  const [proposal] = await query<{id:number}>("select id from market_proposal");
  ok((await query("select 1 from market")).length===0, "pending proposal is not a live market");
  ok(!(await action("examinerProposition", [proposal.id,true,''])).ok, "member cannot approve proposals");
  ok(!(await action("revoquerSessions", [bob])).ok, "member cannot revoke sessions");
  const memberAdmin = await fetch(base+'/profil?onglet=admin', {headers:auth});
  ok(!(await memberAdmin.text()).includes('test-b@example.invalid'), "member cannot view account directory");
  await query("update app_user set role='admin' where id=$1",[bob]);
  const adminCookie = `mp2_session=${tokenBob}`;
  const approvals = await Promise.all([action('examinerProposition',[proposal.id,true,'Amusez-vous !'],adminCookie),action('examinerProposition',[proposal.id,true,''],adminCookie)]);
  ok(approvals.filter(r=>r.ok).length===1, "concurrent approval publishes exactly once");
  ok((await query('select 1 from market')).length===1 && (await query('select 1 from outcome')).length===2, "approved market has its outcomes");
  await submitProposal(alice,suggestion);
  const [expired] = await query<{id:number}>("update market_proposal set closes_at=now()-interval '1 hour' where status='pending' returning id");
  ok(!(await action('examinerProposition',[expired.id,true,''],adminCookie)).ok, "expired proposal cannot be published");
  ok((await action('examinerProposition',[expired.id,false,'Date dépassée'],adminCookie)).ok, "admin can reject with feedback");
  ok(!(await action('proposerPari',[{...suggestion,issues:['Oui','oui']}])).ok, "duplicate outcomes rejected");
  ok(!(await action('proposerPari',[suggestion],'')).ok, "anonymous proposals rejected");
  const adminPage = await fetch(base+'/profil?onglet=admin',{headers:{cookie:adminCookie}});
  ok((await adminPage.text()).includes('test-a@example.invalid'), "admin profile contains account directory");
  await query("update app_user set role='member' where id=$1",[bob]);
  ok((await fetch(base + "/api/documents/1")).status === 401, "unauthenticated download rejected");
  const revs = await Promise.all([action("reviserCarte", [card.id, "good", first!.jeton, 1000]), action("reviserCarte", [card.id, "good", first!.jeton, 1000])]);
  ok(revs.filter(r => r.ok).length === 1, "concurrent first reviews schedule exactly once");
  ok(revs.find(r => r.ok).data.intervalle === first!.apercu[2].intervalle, "stored interval matches signed preview");
  ok((await query("select 1 from review_log")).length === 1, "duplicate review creates no extra log");
  ok((await query("select 1 from card_state where user_id=$1", [bob])).length === 0, "learning state stays personal");
  const bobFirst = await prochaineCarte(bob, deck.id);
  await action("reviserCarte", [card.id, "easy", bobFirst!.jeton, 500], `mp2_session=${tokenBob}`);
  ok((await heatmapClasse(deck.id)).every(r => r.user_id === alice), "heatmap excludes non-consenting member");
  ok((await action("modifierCarte", [card.id, "Recto corrigé", "Verso corrigé", "Correction de test"], `mp2_session=${tokenBob}`)).ok, "classmate can correct a shared card");
  const history = await query<{ edited_by: string }>("select edited_by from card_revision where card_id=$1 order by id", [card.id]);
  ok(history.length === 2 && history[1].edited_by === bob, "edit history records the actual editor");
  async function upload(name: string, bytes: Buffer, cookie = auth.cookie) {
    const fd = new FormData();
    fd.set("fichier", new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
    fd.set("matiere", "Maths"); fd.set("chapitre", "Analyse"); fd.set("tags", "intégrale, corrigé");
    return fetch(base + "/api/documents/upload", { method: "POST", headers: { cookie, origin: base }, body: fd });
  }
  ok(!(await upload("fake.pdf", Buffer.from("not a pdf"))).ok, "forged PDF rejected");
  const pdf = Buffer.alloc(700, 32); pdf.write("%PDF-1.7\n");
  const uploads = await Promise.all([upload("A.pdf", pdf), upload("B.pdf", pdf)]);
  ok(uploads.filter(r => r.ok).length === 1, "concurrent uploads cannot exceed user quota");
  const doc = await uploads.find(r => r.ok)!.json();
  const download = await fetch(base + `/api/documents/${doc.id}`, { headers: auth });
  ok(download.ok && Buffer.from(await download.arrayBuffer()).equals(pdf), "authenticated download streams original bytes");
  const range = await fetch(base + `/api/documents/${doc.id}`, { headers: { ...auth, range: "bytes=0-7" } });
  ok(range.status === 206 && (await range.arrayBuffer()).byteLength === 8, "PDF viewer can request byte ranges");
  ok(!(await action("supprimerDocument", [doc.id], `mp2_session=${tokenBob}`)).ok, "other member cannot delete a document");
  ok((await action("supprimerDocument", [doc.id])).ok, "uploader can soft-delete");
  ok((await fetch(base + `/api/documents/${doc.id}`, { headers: auth })).status === 404, "soft-deleted content is hidden");
  ok(!(await upload("C.pdf", pdf)).ok, "trash still consumes physical quota");
  ok((await action("restaurerDocument", [doc.id])).ok, "uploader can restore within grace period");
  await action("supprimerDocument", [doc.id]);
  ok((await purgerDocuments()).purges === 0, "purge preserves files before 30 days");
  await query("update document set purge_after = now()-interval '1 second' where id=$1", [doc.id]);
  ok((await purgerDocuments()).purges === 1, "expired trash is removed from disk and database");
  const image = Buffer.from([137,80,78,71,13,10,26,10]);
  const apkg = await ecrireApkg("Schémas", [{ recto: "![](figure.png)", verso: "$x$" }], new Map([["figure.png", image]]));
  const fd = new FormData(); fd.set("apkg", new File([new Uint8Array(apkg)], "test.apkg")); fd.set("matiere", "Physique"); fd.set("chapitre", "Optique");
  const imp = await fetch(base + "/api/fiches/import", { method: "POST", headers: { ...auth, origin: base }, body: fd });
  const imported = await imp.json();
  ok(imp.ok && imported.images === 1, "Anki import stores images");
  const [meta] = await query<{ taille: number; mime: string }>("select taille,mime from card_image");
  ok(meta.taille === image.length && meta.mime === "image/png", "imported image metadata reflects disk bytes");
  const exp = await fetch(base + `/api/fiches/export/${imported.slug}`, { headers: auth });
  const exported = await lireApkg(Buffer.from(await exp.arrayBuffer()));
  ok(exported.medias.size === 1 && exported.notes[0].recto.includes("anki-media:"), "Anki export includes referenced image bytes");
  if (process.env.TEST_BROWSER === "1") {
    await query("insert into card(deck_id,recto,verso,author_id) values ($1,'Calculer $2+2$','$4$',$2)", [deck.id, alice]);
    const { browserCheck } = await import("./browser-check");
    await browserCheck(base, token);
  }
  console.log(`Completed ${assertions} integration assertions.`);
} catch (err) { console.error(logs); throw err; }
finally {
  if (serveur && serveur.exitCode === null) { serveur.kill("SIGTERM"); await once(serveur, "exit"); }
  await pool.end();
  await admin.query(`drop schema if exists ${schema} cascade`);
  await admin.end();
  await rm(stockage, { recursive: true, force: true });
}
