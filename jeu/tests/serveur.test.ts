import { after, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { IncomingMessage } from "node:http";
import WebSocket from "ws";
import { CHEMIN_SANTE, CHEMIN_WS, creerServeurJeu } from "../serveur/serveur";

// Port 0 : le système choisit un port libre, aucun conflit possible.
const ORIGINE = "http://site.test";
const serveur = creerServeurJeu({ origines: [ORIGINE] });
const port = await serveur.ecouter(0, "127.0.0.1");
const URL_WS = `ws://127.0.0.1:${port}${CHEMIN_WS}`;
after(() => serveur.fermer());

async function ouvrir(url = URL_WS, origin: string | undefined = ORIGINE): Promise<WebSocket> {
  const ws = new WebSocket(url, origin ? { origin } : {});
  await once(ws, "open");
  return ws;
}

/** Statut HTTP d'une poignée de main refusée. */
async function refus(url: string, origin?: string): Promise<number> {
  const ws = new WebSocket(url, origin ? { origin } : {});
  ws.on("error", () => {});
  const [req, res] = (await once(ws, "unexpected-response")) as [{ destroy(): void }, IncomingMessage];
  req.destroy();
  return res.statusCode!;
}

test("la route de santé répond en JSON", async () => {
  const r = await fetch(`http://127.0.0.1:${port}${CHEMIN_SANTE}`);
  assert.equal(r.status, 200);
  const corps = (await r.json()) as { ok: boolean; connexions: number };
  assert.equal(corps.ok, true);
  assert.equal(typeof corps.connexions, "number");
  assert.equal((await fetch(`http://127.0.0.1:${port}/autre`)).status, 404);
});

test("un message binaire revient en écho", async () => {
  const ws = await ouvrir();
  ws.send(Uint8Array.from([1, 2, 3, 250]));
  const [donnees, binaire] = (await once(ws, "message")) as [Buffer, boolean];
  assert.equal(binaire, true);
  assert.deepEqual([...donnees], [1, 2, 3, 250]);
  ws.close();
  await once(ws, "close");
});

test("sans en-tête Origin (outil hors navigateur), la connexion est acceptée", async () => {
  const ws = await ouvrir(URL_WS, undefined);
  ws.close();
  await once(ws, "close");
});

test("une page d'un autre site ou un mauvais chemin sont refusés", async () => {
  assert.equal(await refus(URL_WS, "https://autre-site.test"), 403);
  assert.equal(await refus(`ws://127.0.0.1:${port}/ailleurs`, ORIGINE), 404);
});

test("un message texte ferme la connexion (1003)", async () => {
  const ws = await ouvrir();
  ws.send("bonjour");
  const [code] = (await once(ws, "close")) as [number];
  assert.equal(code, 1003);
});

test("l'arrêt prévient les clients avec le code demandé", async () => {
  const autre = creerServeurJeu({ origines: [ORIGINE] });
  const p = await autre.ecouter(0, "127.0.0.1");
  const ws = await ouvrir(`ws://127.0.0.1:${p}${CHEMIN_WS}`);
  const fermeture = once(ws, "close");
  await autre.fermer(1012, "redémarrage");
  const [code, raison] = (await fermeture) as [number, Buffer];
  assert.equal(code, 1012);
  assert.equal(raison.toString(), "redémarrage");
});
