/*
 * Bout en bout des vidéos éducatives : Chromium avec caméra simulée
 * enregistre deux clips dans le studio, ajoute un texte et un filtre,
 * publie ; le serveur rend la vidéo avec ffmpeg et le fil la lit.
 * Après `NEXT_BUILD_DIR=.next-portal-check npm run build` :
 *   node --env-file=.env --conditions=react-server --import tsx tests/videos.browser.integration.ts
 * Schéma de test et stockage temporaires ; port 4263, CDP 4264.
 */
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import pg from "pg";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const schema = `videos_test_${process.pid}`;
const stockage = await mkdtemp("/tmp/mp2-videos-");
const captures = process.env.CAPTURES ?? stockage;
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("options", `-c search_path=${schema} -c timezone=Europe/Paris`);
process.env.DATABASE_URL = url.toString();
process.env.STORAGE_ROOT = stockage;
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:4263";
process.env.NEXT_BUILD_DIR = ".next-portal-check";
process.env.MP2_NOTIFS = "off";
const { pool, query } = await import("../src/lib/db");

let serveur: ReturnType<typeof spawn> | undefined;
let navigateur: ReturnType<typeof spawn> | undefined;
let logs = "";
const profil = await mkdtemp("/tmp/mp2-videos-chromium-");
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

try {
  await admin.query(`create schema ${schema}`);
  for (const f of ["db/schema.sql", "db/functions.sql", "db/schema-portal.sql", "db/schema-proposals.sql",
                   "db/schema-etudes.sql", "db/schema-dossiers.sql", "db/schema-kcmaths.sql"]) {
    await query(await readFile(f, "utf8"));
  }
  const [alice] = await query<{ id: string }>(`insert into app_user (email, display_name, password_hash, groupe_colle)
    values ('video-a@example.invalid', 'Test Alice', 'unused', 1) returning id`);
  const jeton = randomBytes(32).toString("base64url");
  await query("insert into user_session(token_hash,user_id,expires_at) values ($1,$2,now()+interval '1 hour')",
    [createHash("sha256").update(jeton).digest(), alice.id]);
  await query("insert into notif_pref (user_id, flash_repondu) values ($1, true)", [alice.id]);

  serveur = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "4263", "-H", "127.0.0.1"],
    { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  serveur.stdout!.on("data", (d) => { logs += d; });
  serveur.stderr!.on("data", (d) => { logs += d; });
  const base = process.env.PUBLIC_ORIGIN;
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`${base}/connexion`)).ok) break; } catch {}
    await pause(100);
  }

  navigateur = spawn("/usr/bin/chromium", ["--headless", "--no-sandbox", "--disable-gpu", "--no-first-run",
    "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=4264", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profil}`, "about:blank"],
    { stdio: "ignore", detached: true });
  let cible: { webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 100 && !cible; i++) {
    try { cible = (await (await fetch("http://127.0.0.1:4264/json")).json()).find((t: { type: string }) => t.type === "page"); } catch {}
    await pause(100);
  }
  assert.ok(cible, "Chromium démarre");
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise<void>((ok, ko) => { ws.onopen = () => ok(); ws.onerror = ko; });
  let n = 0;
  const attente = new Map<number, { ok: (r: any) => void; ko: (e: unknown) => void }>();
  ws.onmessage = (e) => {
    const r = JSON.parse(String(e.data));
    const p = attente.get(r.id);
    if (p) { attente.delete(r.id); if (r.error) p.ko(r.error); else p.ok(r.result); }
  };
  const envoyer = (method: string, params: Record<string, unknown> = {}): Promise<any> =>
    new Promise((ok, ko) => { const k = ++n; attente.set(k, { ok, ko }); ws.send(JSON.stringify({ id: k, method, params })); });
  async function evaluer(expression: string) {
    const r = await envoyer("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }
  async function jusqua(expression: string, essais = 150) {
    for (let i = 0; i < essais; i++) {
      if (await evaluer(`!!document.body && (${expression})`)) return;
      await pause(100);
    }
    throw new Error(`délai dépassé : ${expression} ; ${await evaluer("document.body.innerText.slice(0, 800)")}`);
  }
  async function capture(nom: string) {
    const img = await envoyer("Page.captureScreenshot", { format: "png" });
    await writeFile(`${captures}/videos-${nom}.png`, Buffer.from(img.data, "base64"));
  }
  const cliquer = (selecteur: string) => evaluer(`(() => { const el = ${selecteur}; if (!el) throw new Error("absent: " + ${JSON.stringify(selecteur)}); el.click(); return true; })()`);
  const bouton = (texte: string) => `[...document.querySelectorAll("button")].find(b => b.textContent.trim() === ${JSON.stringify(texte)} || b.getAttribute("aria-label") === ${JSON.stringify(texte)})`;
  const saisir = (selecteur: string, valeur: string) => evaluer(`(() => {
    const el = ${selecteur};
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(valeur)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);

  await envoyer("Page.enable");
  await envoyer("Network.setCookie", { name: "mp2_session", value: jeton, url: base, httpOnly: true, sameSite: "Lax" });
  await envoyer("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  await envoyer("Page.navigate", { url: `${base}/divertissement` });
  await jusqua(`!!document.querySelector('a[href="/divertissement/videos"]')`);
  await envoyer("Page.navigate", { url: `${base}/divertissement/videos` });
  // L'onglet ouvre directement le fil ; + en bas mène au studio.
  await jusqua(`document.body.innerText.includes("Aucune vidéo pour l’instant") && !!document.querySelector(".videos__plus")`);
  await capture("fil-vide");
  await cliquer(`document.querySelector(".videos__plus")`);
  await jusqua(`location.pathname === "/divertissement/videos/nouvelle"`);
  await jusqua(`!!document.querySelector(".studio__rec:not(:disabled)")`);
  await jusqua(`document.querySelector(".studio__camera").videoWidth > 0`);
  // Clip 1 : 3 s ; clip 2 : 2 s.
  await cliquer(`document.querySelector(".studio__rec")`);
  await pause(3000);
  await capture("enregistrement");
  await cliquer(`document.querySelector(".studio__rec")`);
  await jusqua(`document.body.innerText.includes("1 clip")`);
  await cliquer(`document.querySelector(".studio__rec")`);
  await pause(2000);
  await cliquer(`document.querySelector(".studio__rec")`);
  await jusqua(`document.body.innerText.includes("2 clips")`);
  await cliquer(bouton("Suivant"));

  await jusqua(`document.body.innerText.includes("Montage")`);
  await jusqua(`document.querySelector(".editeur__scene video").readyState >= 1`);
  assert.equal(await evaluer(`document.querySelectorAll(".editeur__frise > span").length`), 2, "deux segments sur la frise");
  // Lecture de l'aperçu : la tête avance et passe au second clip.
  await cliquer(bouton("Lire"));
  await pause(3800);
  const t = await evaluer(`Number(document.querySelector(".editeur__frise").getAttribute("aria-valuenow"))`);
  assert.ok(t >= 3, `l'aperçu enchaîne les clips (t = ${t})`);
  await cliquer(bouton("Pause"));

  await cliquer(bouton("Texte"));
  await cliquer(bouton("+ Texte"));
  await saisir(`document.querySelector("textarea")`, "Dérivée : f'(x) ⇒ pente");
  await pause(200);
  await cliquer(bouton("Filtres"));
  await cliquer(bouton("N&B"));
  await cliquer(bouton("Couverture"));
  await capture("montage");
  await cliquer(bouton("Suivant"));

  await jusqua(`document.body.innerText.includes("Publier pour la classe")`);
  await saisir(`document.querySelector("input[maxlength='120']")`, "Les dérivées en 5 secondes");
  await saisir(`document.querySelector("textarea")`, "Test automatique.");
  await capture("publier");
  await cliquer(bouton("Publier pour la classe"));
  await jusqua(`location.pathname === "/divertissement/videos/profil/moi"`, 300);

  let statut = "";
  for (let i = 0; i < 180 && statut !== "pret"; i++) {
    statut = (await query<{ statut: string }>("select statut from video"))[0]?.statut ?? "";
    if (statut === "echec") break;
    await pause(1000);
  }
  const [v] = await query<{ id: number; statut: string; erreur: string | null; duree_ms: number; sources: string[]; montage: any }>(
    "select id, statut, erreur, duree_ms, sources, montage from video");
  assert.equal(v.statut, "pret", `rendu terminé (${v.erreur ?? ""})\n${logs.slice(-2000)}`);
  assert.ok(v.duree_ms > 4000 && v.duree_ms < 6000, `durée ${v.duree_ms} ms`);
  assert.equal(v.sources.length, 0, "clips bruts supprimés après rendu");
  assert.equal(v.montage.clips[0].filtre, "nb");
  assert.equal(v.montage.textes[0].texte, "Dérivée : f'(x) ⇒ pente");
  console.log("PASS rendu", v.duree_ms, "ms");

  // Le profil se rafraîchit seul pendant le montage, puis montre la vignette.
  await jusqua(`!!document.querySelector(".videos__vignette")`, 200);
  assert.ok(await evaluer(`document.body.innerText.includes("Test Alice") && document.body.innerText.includes("Nouvelle vidéo")`), "profil personnel");
  await capture("profil");
  await cliquer(`document.querySelector(".videos__vignette")`);
  await jusqua(`location.search.startsWith("?auteur=") && document.querySelector("h1")?.textContent === "Vidéos de Test Alice"`);
  await jusqua(`document.querySelector(".videos__lecteur")?.currentTime > 0.3`, 100);
  // Retour au fil de la classe par la barre basse.
  await cliquer(`[...document.querySelectorAll(".videos__onglet")].find(a => a.textContent.trim() === "Fil")`);
  await jusqua(`location.pathname === "/divertissement/videos" && !location.search && !!document.querySelector(".videos__lecteur")`);
  await jusqua(`document.querySelector(".videos__lecteur").currentTime > 0.5`, 100);
  await capture("fil");
  await cliquer(bouton("J’aime (0)"));
  await jusqua(`!!${bouton("Je n’aime plus (1)")}`);
  await cliquer(bouton("Commentaires (0)"));
  await jusqua(`document.body.innerText.includes("Pas encore de commentaire")`);
  // Le champ doit être au premier plan (la feuille glisse en 220 ms).
  await jusqua(`(() => { const i = document.querySelector(".reels__feuille input"); const b = i.getBoundingClientRect();
    return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === i; })()`, 30).catch(async (e) => {
    throw new Error(`champ de commentaire masqué par ${await evaluer(`(() => { const b = document.querySelector(".reels__feuille input").getBoundingClientRect();
      const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return el ? el.outerHTML.slice(0, 200) + " @" + Math.round(b.top) : "rien @" + Math.round(b.top); })()`)} ; ${e}`);
  });
  await saisir(`document.querySelector(".reels__feuille input")`, "Super clair, merci !");
  await cliquer(bouton("Publier"));
  await jusqua(`document.body.innerText.includes("Super clair, merci !")`);
  await capture("commentaires");
  // Cliquer sur un auteur (ici dans les commentaires) ouvre son profil.
  await cliquer(`document.querySelector('.reels__feuille a[href^="/divertissement/videos/profil/"]:not(.reels__avatar)')`);
  await jusqua(`location.pathname === "/divertissement/videos/profil/${alice.id}" && !!document.querySelector(".videos__vignette")`);
  assert.deepEqual(await evaluer(`[...document.querySelectorAll("dl dd")].map(d => d.textContent)`), ["1", "1", "1"],
    "compteurs du profil (vidéos, j’aime, vues)");
  assert.equal((await query("select 1 from video_like")).length, 1);
  assert.equal((await query("select 1 from video_commentaire")).length, 1);
  assert.equal((await query("select 1 from video_vue")).length, 1);
  const r = await fetch(`${base}/api/videos/${v.id}`, { headers: { cookie: `mp2_session=${jeton}`, range: "bytes=0-99" } });
  assert.equal(r.status, 206);
  const couv = await fetch(`${base}/api/videos/${v.id}?couverture=1`, { headers: { cookie: `mp2_session=${jeton}` } });
  assert.equal(couv.headers.get("content-type"), "image/jpeg");
  assert.equal((await couv.arrayBuffer()).byteLength > 1000, true, "couverture JPEG");
  assert.ok(await evaluer(`(async () => { const i = document.createElement("img"); i.src = "/api/videos/${v.id}?couverture=1"; await i.decode(); return i.naturalWidth === 360; })()`), "la couverture s'affiche dans la page");
  assert.equal((await fetch(`${base}/api/videos/${v.id}`)).status, 401, "lecture anonyme refusée");
  console.log("PASS vidéos éducatives, captures dans", captures);
  ws.close();
} finally {
  if (navigateur?.pid) try { process.kill(-navigateur.pid); } catch {}
  serveur?.kill();
  await pool.end();
  await admin.query(`drop schema if exists ${schema} cascade`);
  await admin.end();
  await rm(profil, { recursive: true, force: true });
  if (!process.env.CAPTURES) await rm(stockage, { recursive: true, force: true });
}
