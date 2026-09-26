import { test } from "node:test";
import assert from "node:assert/strict";
import { CARTES, PERSOS, PERSOS_ENTRAINEMENT } from "../noyau/contenu";
import { TOUTES } from "../noyau/entrees";
import { avancerMonde, creerMonde, type Monde } from "../noyau/monde";
import { REGLAGES_STANDARD } from "../noyau/regles";
import { Ecrivain, Lecteur } from "../protocole/binaire";
import type { EvenementDate } from "../protocole/etat";
import {
  B_ENTREE, B_ETAT, B_PING, coderEntree, coderInstantane, coderPing, decoderBinaire, lireEtat,
} from "../protocole/messages";
import { signerTicket, verifierTicket } from "../protocole/ticket";
import { entreesAleatoires } from "./outils";

test("varints et zigzag : bornes, négatifs, grands nombres, textes accentués", () => {
  const valeurs = [0, 1, -1, 63, -64, 64, 127, 128, 300, -300, 65_535, 2 ** 31, -(2 ** 31), 2 ** 50, -(2 ** 50)];
  const e = new Ecrivain();
  for (const v of valeurs) e.entier(v);
  e.texte("Mr Corbiceps — « oui non non oui » Σ∏∫").booleen(true).naturel(0);
  const l = new Lecteur(e.resultat());
  for (const v of valeurs) assert.equal(l.entier(), v);
  assert.equal(l.texte(), "Mr Corbiceps — « oui non non oui » Σ∏∫");
  assert.equal(l.booleen(), true);
  assert.equal(l.naturel(), 0);
  assert.ok(l.fini());
  assert.throws(() => l.octet(), /tronqué/);
  assert.throws(() => new Ecrivain().entier(1.5));
});

/** Rejoue une partie et compare l'état décodé à l'original, tick après tick. */
test("instantané : aller-retour exact de l'état complet sur une vraie partie", () => {
  const persos = [PERSOS[0], PERSOS_ENTRAINEMENT[0], PERSOS[0]];
  const m: Monde = creerMonde(CARTES[0], persos, REGLAGES_STANDARD);
  const entrees = persos.map((_, i) => entreesAleatoires(5 + i, 6000, TOUTES));
  let tailleMax = 0;
  for (let t = 0; t < 6000; t++) {
    avancerMonde(m, entrees.map((e) => e[t]));
    if (t % 7 !== 0) continue;
    const evenements: EvenementDate[] = m.evenements.map((evenement) => ({ tick: m.tick, evenement }));
    const octets = coderInstantane({ monde: m, acks: [t, t + 1, 0], evenements });
    tailleMax = Math.max(tailleMax, octets.length);
    const d = decoderBinaire(octets);
    assert.equal(d.b, B_ETAT);
    if (d.b !== B_ETAT) return;
    const i = lireEtat(d.lecteur, { carte: m.carte, reglages: m.reglages });
    assert.deepEqual(i.monde, { ...m, evenements: [] }, `tick ${m.tick}`);
    assert.deepEqual(i.acks, [t, t + 1, 0]);
    assert.deepEqual(i.evenements, evenements);
  }
  assert.ok(tailleMax < 1200, `instantané à 3 combattants : ${tailleMax} octets au plus`);
});

test("entrées et pings : quelques octets", () => {
  const e = coderEntree(123_456, TOUTES);
  assert.ok(e.length <= 6);
  assert.deepEqual(decoderBinaire(e), { b: B_ENTREE, seq: 123_456, entree: TOUTES });
  assert.deepEqual(decoderBinaire(coderPing(B_PING, 987_654)), { b: B_PING, horodatage: 987_654 });
  assert.throws(() => decoderBinaire(Uint8Array.of(99)));
});

test("ticket : signé, vérifié, refusé s'il est expiré, falsifié ou signé d'un autre secret", async () => {
  const t = { uid: "u-1", nom: "Élève Été", role: "member" as const, exp: Date.now() + 60_000 };
  const jeton = await signerTicket(t, "secret-a");
  assert.deepEqual(await verifierTicket(jeton, "secret-a"), t);
  assert.equal(await verifierTicket(jeton, "secret-b"), null, "autre secret");
  assert.equal(await verifierTicket(jeton, "secret-a", t.exp + 1), null, "expiré");
  const [charge, signature] = jeton.split(".");
  const falsifie = Buffer.from(JSON.stringify({ ...t, role: "admin" })).toString("base64url");
  assert.equal(await verifierTicket(`${falsifie}.${signature}`, "secret-a"), null, "charge modifiée");
  assert.equal(await verifierTicket(`${charge}.`, "secret-a"), null);
  assert.equal(await verifierTicket("n'importe quoi", "secret-a"), null);
  assert.equal(await verifierTicket(jeton, ""), null, "sans secret, rien n'est valide");
});
