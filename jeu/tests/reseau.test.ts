import { after, test } from "node:test";
import assert from "node:assert/strict";
import { connecterJeu, type ConnexionJeu, type EtatConnexion } from "../client/reseau/connexion";
import { creerSessionReseau, type SessionReseau } from "../client/reseau/session-reseau";
import { DROITE, type Entree } from "../noyau/entrees";
import { REGLAGES_STANDARD } from "../noyau/regles";
import { CHEMIN_WS } from "../protocole/messages";
import { signerTicket } from "../protocole/ticket";
import { creerServeurJeu } from "../serveur/serveur";

/*
 * Le netcode de bout en bout, sans navigateur : le vrai serveur, les
 * vrais modules client (connexion, session réseau), et un réseau lent
 * simulé. On vérifie ce que ressent le joueur : son personnage répond
 * tout de suite, finit exactement là où le serveur le dit, et l'autre
 * joueur le voit bouger.
 */

const SECRET = "secret-reseau";
const serveur = creerServeurJeu({
  origines: [], secret: SECRET, reglages: { ...REGLAGES_STANDARD, dureeDecompte: 20 },
});
const port = await serveur.ecouter(0, "127.0.0.1");
const URL_WS = `ws://127.0.0.1:${port}${CHEMIN_WS}`;
after(() => serveur.fermer());

/** WebSocket dont chaque message met `ms` à passer, dans chaque sens. */
function retarde(ms: number): typeof WebSocket {
  return class extends WebSocket {
    override send(donnees: string | ArrayBufferLike | Blob | ArrayBufferView) {
      setTimeout(() => {
        if (this.readyState === WebSocket.OPEN) super.send(donnees);
      }, ms);
    }
    override set onmessage(f: ((e: MessageEvent) => void) | null) {
      super.onmessage = f ? (e: MessageEvent) => setTimeout(() => f.call(this, e), ms) : null;
    }
    override get onmessage() {
      return super.onmessage;
    }
  };
}

function connecter(uid: string, WS?: typeof WebSocket): ConnexionJeu {
  return connecterJeu({
    url: URL_WS,
    WebSocket: WS,
    ticket: () => signerTicket({ uid, nom: uid, role: "member", exp: Date.now() + 60_000 }, SECRET),
  });
}

async function attendre(c: ConnexionJeu, condition: (e: EtatConnexion) => boolean, ms = 3000): Promise<EtatConnexion> {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (condition(c.etat())) return c.etat();
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`état attendu non atteint : ${JSON.stringify(c.etat())}`);
}

/** Fait tourner des sessions en temps réel pendant `ms`, 60 images par seconde. */
async function jouer(sessions: [SessionReseau, () => Entree][], ms: number): Promise<void> {
  let avant = performance.now();
  const fin = avant + ms;
  while (performance.now() < fin) {
    await new Promise((r) => setTimeout(r, 16));
    const t = performance.now();
    for (const [s, entree] of sessions) {
      s.avancer(t - avant, entree);
      s.vue();
    }
    avant = t;
  }
}

async function partieA2(latenceAlice: number) {
  const alice = connecter("alice", latenceAlice > 0 ? retarde(latenceAlice / 2) : undefined);
  const bob = connecter("bob");
  await attendre(alice, (e) => e.statut === "connecte");
  await attendre(bob, (e) => e.statut === "connecte");
  alice.envoyer({ t: "creer" });
  const { salon } = await attendre(alice, (e) => e.salon !== null);
  bob.envoyer({ t: "rejoindre", code: salon!.code });
  await attendre(bob, (e) => e.salon !== null);
  bob.envoyer({ t: "pret", pret: true });
  await attendre(alice, (e) => e.salon!.places[1]?.pret === true);
  alice.envoyer({ t: "lancer" });
  const ea = await attendre(alice, (e) => e.partie !== null);
  const eb = await attendre(bob, (e) => e.partie !== null);
  const sa = creerSessionReseau(alice, ea.partie!);
  const sb = creerSessionReseau(bob, eb.partie!);
  return { alice, bob, sa, sb, code: salon!.code };
}

test("100 ms d'aller-retour : réponse immédiate, puis la position prédite rejoint exactement celle du serveur", async () => {
  const { alice, bob, sa, sb, code } = await partieA2(100);
  const monde = serveur.hall.salon(code)!.partie!.monde;
  let entree: Entree = 0;
  // Attendre le combat et un premier instantané côté Alice.
  while (monde.phase !== "combat") await jouer([[sa, () => 0], [sb, () => 0]], 50);
  await jouer([[sa, () => 0], [sb, () => 0]], 300);

  const depart = sa.vue().positions[0].x;
  const departServeur = monde.combattants[0].x;
  entree = DROITE;
  await jouer([[sa, () => entree], [sb, () => 0]], 60);
  assert.ok(sa.vue().positions[0].x > depart, "le personnage d'Alice bouge chez elle aussitôt");
  assert.equal(monde.combattants[0].x, departServeur, "…avant même que le serveur ait reçu l'entrée");

  await jouer([[sa, () => entree], [sb, () => 0]], 700);
  entree = 0;
  await jouer([[sa, () => entree], [sb, () => 0]], 800);
  const officiel = monde.combattants[0].x;
  assert.ok(officiel > departServeur + 10_000, "le serveur a bien fait avancer Alice");
  assert.ok(Math.abs(sa.vue().positions[0].x - officiel) < 200, `prédiction ${sa.vue().positions[0].x} contre ${officiel}`);
  assert.ok(Math.abs(sb.vue().positions[0].x - officiel) < 200, "Bob voit Alice au même endroit");
  assert.ok(sb.delai() >= 3 && sb.delai() <= 14);
  alice.fermer();
  bob.fermer();
});

test("coupure : la connexion revient toute seule et reprend la partie", async () => {
  const { alice, bob, code } = await partieA2(0);
  const premiere = bob.etat().partie;
  const place = serveur.hall.salon(code)!.places[1]!;
  place.connexion!.fermer(4002, "coupure simulée");
  await attendre(bob, (e) => e.statut === "reconnexion");
  const e = await attendre(bob, (e) => e.statut === "connecte" && e.partie !== null && e.partie !== premiere, 5000);
  assert.equal(e.partie!.place, 1);
  assert.ok(serveur.hall.salon(code)!.places[1]!.connexion !== null, "la place est de nouveau tenue");
  alice.fermer();
  bob.fermer();
});

test("connexion différée : aucune socket (ni ticket) avant le premier abonné", () => {
  let sockets = 0;
  let tickets = 0;
  class FausseSocket {
    binaryType = "";
    onopen: (() => void) | null = null;
    constructor() {
      sockets++;
    }
    send() {}
    close() {}
  }
  const c = connecterJeu({
    url: "ws://exemple.invalid/ws/jeu",
    ticket: async () => (tickets++, "t"),
    WebSocket: FausseSocket as unknown as typeof WebSocket,
    auPremierAbonne: true,
  });
  assert.equal(sockets, 0, "rien n'est ouvert pendant le rendu");
  const desabonner = c.abonner(() => {});
  assert.equal(sockets, 1, "le premier abonné ouvre la connexion");
  c.abonner(() => {});
  assert.equal(sockets, 1, "une seule fois");
  assert.equal(tickets, 0, "le ticket attend l'ouverture de la socket");
  desabonner();
  c.fermer();
});
