import { test } from "node:test";
import assert from "node:assert/strict";
import { boiteDe } from "../noyau/combattant";
import { chevauche } from "../noyau/collisions";
import { JAUGE_MAX } from "../noyau/coups";
import { CARTES, PERSOS } from "../noyau/contenu";
import { TOUTES } from "../noyau/entrees";
import { avancerMonde, creerMonde, empreinteMonde, type Monde } from "../noyau/monde";
import { REGLAGES_STANDARD } from "../noyau/regles";
import { entreesAleatoires, valeursEntieres } from "./outils";

/*
 * Parties complètes jouées au hasard, sur le vrai contenu : la
 * simulation doit rester cohérente à chaque tick et donner exactement
 * le même résultat quand on la rejoue.
 */

function verifier(m: Monde): void {
  const faute = valeursEntieres(m);
  assert.equal(faute, null, `valeur non entière : ${faute} (tick ${m.tick})`);
  for (const c of m.combattants) {
    assert.ok(c.pv >= 0 && c.pv <= c.perso.stats.pv, `PV hors bornes au tick ${m.tick}`);
    assert.ok(c.jauge >= 0 && c.jauge <= JAUGE_MAX, `jauge hors bornes au tick ${m.tick}`);
    if (c.horsJeu) continue;
    const b = boiteDe(c);
    for (const s of m.carte.solides) assert.ok(!chevauche(b, s), `combattant ${c.id} dans un solide au tick ${m.tick}`);
  }
}

function partie(graine: number, joueurs: number, ticksMax = 40_000): { empreintes: number[]; monde: Monde; touches: number } {
  const persos = Array.from({ length: joueurs }, (_, i) => PERSOS[i % PERSOS.length]);
  const m = creerMonde(CARTES[graine % CARTES.length], persos, REGLAGES_STANDARD);
  const entrees = persos.map((_, i) => entreesAleatoires(graine * 31 + i, ticksMax, TOUTES));
  const empreintes: number[] = [];
  let touches = 0;
  while (m.phase !== "finPartie" && m.tick < ticksMax) {
    avancerMonde(m, entrees.map((e) => e[m.tick]));
    verifier(m);
    touches += m.evenements.filter((e) => e.type === "touche").length;
    if (m.tick % 600 === 0) empreintes.push(empreinteMonde(m));
  }
  empreintes.push(empreinteMonde(m));
  return { empreintes, monde: m, touches };
}

test("mêmes entrées, même partie, tick après tick (2 joueurs)", () => {
  const a = partie(42, 2);
  assert.deepEqual(partie(42, 2).empreintes, a.empreintes);
  assert.notEqual(partie(7, 2).empreintes.at(-1), a.empreintes.at(-1));
});

test("parties à 4 joueurs cohérentes et déterministes", () => {
  const a = partie(3, 4);
  assert.deepEqual(partie(3, 4).empreintes, a.empreintes);
  assert.ok(a.touches > 0, "des coups ont bien été portés");
});

test("une partie va à son terme : manches, vainqueur", () => {
  const { monde } = partie(11, 2, 200_000);
  assert.equal(monde.phase, "finPartie");
  assert.ok(monde.manche >= 2 && monde.manche <= 3);
});

test("performance : une partie à 4 se simule bien plus vite que le temps réel", () => {
  // PV immenses, chutes gratuites, pas de chrono : les quatre restent en jeu
  // pendant les 36 000 ticks (10 minutes de partie).
  const increvables = [0, 1, 2, 3].map((i) => {
    const p = PERSOS[i % PERSOS.length];
    return { ...p, stats: { ...p.stats, pv: 1_000_000_000 } };
  });
  const m = creerMonde(CARTES[0], increvables, { ...REGLAGES_STANDARD, dureeManche: 0, penaliteChute: 0 });
  const entrees = [0, 1, 2, 3].map((i) => entreesAleatoires(99 + i, 36_000, TOUTES));
  const debut = performance.now();
  let touches = 0;
  for (let t = 0; t < 36_000; t++) {
    avancerMonde(m, entrees.map((e) => e[t]));
    touches += m.evenements.length;
  }
  const ms = performance.now() - debut;
  assert.equal(m.phase, "combat", "la partie a duré jusqu'au bout");
  assert.ok(touches > 0);
  const ticksParSeconde = Math.round(36_000 / (ms / 1000));
  console.log(`  ${ticksParSeconde} ticks/s à 4 combattants (${(ms / 36_000).toFixed(4)} ms par tick)`);
  assert.ok(ticksParSeconde > 6000, "au moins 100× le temps réel");
});
