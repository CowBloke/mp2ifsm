import { after, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { IncomingMessage } from "node:http";
import WebSocket from "ws";
import { DROITE } from "../noyau/entrees";
import {
  B_ETAT, VERSION_PROTOCOLE, coderEntree, decoderBinaire, type MessageClient, type MessageServeur,
} from "../protocole/messages";
import { signerTicket } from "../protocole/ticket";
import { CHEMIN_SANTE, CHEMIN_WS, creerServeurJeu } from "../serveur/serveur";

/*
 * Le serveur de jeu au niveau du protocole, avec des clients bruts.
 */

const SECRET = "secret-de-test";
const ORIGINE = "http://site.test";
const serveur = creerServeurJeu({ origines: [ORIGINE], secret: SECRET, reglages: undefined });
const port = await serveur.ecouter(0, "127.0.0.1");
const URL_WS = `ws://127.0.0.1:${port}${CHEMIN_WS}`;
after(() => serveur.fermer());

class Client {
  readonly messages: MessageServeur[] = [];
  readonly etats: Uint8Array[] = [];
  fermeture: Promise<[number, Buffer]>;
  private constructor(readonly ws: WebSocket) {
    ws.on("message", (d, binaire) => {
      if (binaire) this.etats.push(new Uint8Array(d as Buffer));
      else this.messages.push(JSON.parse(d.toString()));
    });
    this.fermeture = once(ws, "close") as Promise<[number, Buffer]>;
  }

  static async ouvrir(): Promise<Client> {
    const ws = new WebSocket(URL_WS, { origin: ORIGINE });
    await once(ws, "open");
    return new Client(ws);
  }

  /** Connexion authentifiée sous le compte `uid`. */
  static async entrer(uid: string, nom = uid): Promise<Client> {
    const c = await Client.ouvrir();
    c.envoyer({ t: "bonjour", v: VERSION_PROTOCOLE, ticket: await signerTicket({ uid, nom, role: "member", exp: Date.now() + 60_000 }, SECRET) });
    await c.attendre((m) => m.t === "bienvenue");
    return c;
  }

  envoyer(m: MessageClient | Record<string, unknown>): void {
    this.ws.send(JSON.stringify(m));
  }

  async attendre<T extends MessageServeur>(filtre: (m: MessageServeur) => boolean, ms = 2000): Promise<T> {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      const i = this.messages.findIndex(filtre);
      if (i >= 0) return this.messages.splice(i, 1)[0] as T;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`message attendu non reçu ; reçus : ${JSON.stringify(this.messages.map((m) => m.t))}`);
  }

  async attendreEtats(n: number, ms = 2000): Promise<void> {
    const fin = Date.now() + ms;
    while (this.etats.length < n && Date.now() < fin) await new Promise((r) => setTimeout(r, 10));
    assert.ok(this.etats.length >= n, `${this.etats.length} instantanés reçus`);
  }

  fermer(): void {
    this.ws.close();
  }
}

type Salon = Extract<MessageServeur, { t: "salon" }>;

async function salonA2(): Promise<{ a: Client; b: Client; code: string }> {
  const a = await Client.entrer("alice", "Alice");
  a.envoyer({ t: "creer" });
  const { salon } = await a.attendre<Salon>((m) => m.t === "salon");
  const b = await Client.entrer("bob", "Bob");
  b.envoyer({ t: "rejoindre", code: salon.code });
  await b.attendre((m) => m.t === "salon");
  return { a, b, code: salon.code };
}

test("santé : JSON avec le nombre de salons et de parties", async () => {
  const r = await fetch(`http://127.0.0.1:${port}${CHEMIN_SANTE}`);
  const corps = (await r.json()) as Record<string, unknown>;
  assert.equal(corps.ok, true);
  assert.equal(typeof corps.salons, "number");
  assert.equal(typeof corps.parties, "number");
});

test("poignée de main : autre origine (403) ou autre chemin (404) refusés", async () => {
  const statut = async (url: string, origin: string) => {
    const ws = new WebSocket(url, { origin });
    ws.on("error", () => {});
    const [req, res] = (await once(ws, "unexpected-response")) as [{ destroy(): void }, IncomingMessage];
    req.destroy();
    return res.statusCode;
  };
  assert.equal(await statut(URL_WS, "https://autre-site.test"), 403);
  assert.equal(await statut(`ws://127.0.0.1:${port}/ailleurs`, ORIGINE), 404);
});

test("sans ticket valide, rien n'est possible", async () => {
  const sans = await Client.ouvrir();
  sans.envoyer({ t: "creer" });
  assert.equal((await sans.fermeture)[0], 4003, "message avant authentification");

  const faux = await Client.ouvrir();
  faux.envoyer({ t: "bonjour", v: VERSION_PROTOCOLE, ticket: "faux.ticket" });
  assert.equal((await faux.attendre((m) => m.t === "refus")).t, "refus");
  assert.equal((await faux.fermeture)[0], 4003);

  const vieux = await Client.ouvrir();
  vieux.envoyer({ t: "bonjour", v: VERSION_PROTOCOLE - 1, ticket: "x" });
  assert.equal((await vieux.fermeture)[0], 4000, "version périmée");

  const bavard = await Client.ouvrir();
  bavard.ws.send("{pas du json");
  assert.equal((await bavard.fermeture)[0], 1008, "message illisible");
});

test("salon : code court, hôte, cinq joueurs pour quatre places", async () => {
  const hote = await Client.entrer("h1");
  hote.envoyer({ t: "creer" });
  const { salon } = await hote.attendre<Salon>((m) => m.t === "salon");
  assert.match(salon.code, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(salon.hote, "h1");
  assert.equal(salon.places[0]?.uid, "h1");

  const autres = await Promise.all(["h2", "h3", "h4", "h5"].map((u) => Client.entrer(u)));
  for (const c of autres.slice(0, 3)) {
    c.envoyer({ t: "rejoindre", code: salon.code });
    await c.attendre((m) => m.t === "salon");
  }
  autres[3].envoyer({ t: "rejoindre", code: salon.code });
  assert.equal((await autres[3].attendre<Extract<MessageServeur, { t: "erreur" }>>((m) => m.t === "erreur")).message, "Salon complet.");

  autres[3].envoyer({ t: "rejoindre", code: "ZZZZ" });
  await autres[3].attendre((m) => m.t === "erreur");
  for (const c of [hote, ...autres]) c.fermer();
});

test("partie : seul l'hôte lance, tous les joueurs reçoivent le départ puis les instantanés", async () => {
  const { a, b, code } = await salonA2();
  b.envoyer({ t: "lancer" });
  await b.attendre((m) => m.t === "erreur");
  a.envoyer({ t: "lancer" });
  await a.attendre((m) => m.t === "erreur"); // Bob n'est pas prêt
  b.envoyer({ t: "pret", pret: true });
  a.envoyer({ t: "lancer" });
  const da = await a.attendre<Extract<MessageServeur, { t: "debut" }>>((m) => m.t === "debut");
  const db = await b.attendre<Extract<MessageServeur, { t: "debut" }>>((m) => m.t === "debut");
  assert.deepEqual([da.partie.place, db.partie.place], [0, 1]);
  assert.deepEqual(da.partie.noms, ["Alice", "Bob"]);
  await a.attendreEtats(5);
  assert.equal(decoderBinaire(a.etats[0]).b, B_ETAT);

  // Les entrées d'Alice font bouger son combattant (une fois le décompte passé).
  const monde = serveur.hall.salon(code)!.partie!.monde;
  while (monde.phase !== "combat") await new Promise((r) => setTimeout(r, 20));
  const x = monde.combattants[0].x;
  for (let seq = 1; seq <= 30; seq++) {
    a.ws.send(coderEntree(seq, DROITE));
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(monde.combattants[0].x > x, "Alice a avancé");
  a.fermer();
  b.fermer();
});

test("un spectateur reçoit la partie mais n'a aucune prise dessus", async () => {
  const { a, b, code } = await salonA2();
  b.envoyer({ t: "pret", pret: true });
  a.envoyer({ t: "lancer" });
  await a.attendre((m) => m.t === "debut");
  const s = await Client.entrer("spectateur");
  s.envoyer({ t: "regarder", code });
  const d = await s.attendre<Extract<MessageServeur, { t: "debut" }>>((m) => m.t === "debut");
  assert.equal(d.partie.place, -1);
  await s.attendreEtats(3);

  const monde = serveur.hall.salon(code)!.partie!.monde;
  while (monde.phase !== "combat") await new Promise((r) => setTimeout(r, 20));
  const xs = monde.combattants.map((c) => c.x);
  for (let seq = 1; seq <= 20; seq++) s.ws.send(coderEntree(seq, DROITE));
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(monde.combattants.map((c) => c.x), xs, "personne n'a bougé");
  for (const c of [a, b, s]) c.fermer();
});

test("déconnecté en partie, on garde sa place et on la reprend", async () => {
  const { a, b, code } = await salonA2();
  b.envoyer({ t: "pret", pret: true });
  a.envoyer({ t: "lancer" });
  await b.attendre((m) => m.t === "debut");
  b.fermer();
  const { salon } = await a.attendre<Salon>((m) => m.t === "salon" && (m as Salon).salon.places[1]?.connecte === false);
  assert.equal(salon.places[1]?.uid, "bob", "place conservée");

  const retour = await Client.entrer("bob", "Bob");
  retour.envoyer({ t: "rejoindre", code });
  const d = await retour.attendre<Extract<MessageServeur, { t: "debut" }>>((m) => m.t === "debut");
  assert.equal(d.partie.place, 1);
  await retour.attendreEtats(2);

  // La page a pu être rechargée : les numéros d'entrées repartent de 1,
  // et le serveur doit les accepter.
  const monde = serveur.hall.salon(code)!.partie!.monde;
  while (monde.phase !== "combat") await new Promise((r) => setTimeout(r, 20));
  const x = monde.combattants[1].x;
  for (let seq = 1; seq <= 30; seq++) {
    retour.ws.send(coderEntree(seq, DROITE));
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(monde.combattants[1].x > x, "les entrées du joueur revenu sont prises en compte");
  a.fermer();
  retour.fermer();
});

test("l'arrêt du serveur prévient les clients (1012)", async () => {
  const autre = creerServeurJeu({ origines: [ORIGINE], secret: SECRET, boucle: false });
  const p = await autre.ecouter(0, "127.0.0.1");
  const ws = new WebSocket(`ws://127.0.0.1:${p}${CHEMIN_WS}`, { origin: ORIGINE });
  await once(ws, "open");
  const fermeture = once(ws, "close");
  await autre.fermer(1012, "redémarrage");
  const [code] = (await fermeture) as [number];
  assert.equal(code, 1012);
});
