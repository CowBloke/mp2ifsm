import { test } from "node:test";
import assert from "node:assert/strict";
import type { CoupDef } from "../noyau/definitions";
import { ATTAQUE } from "../noyau/entrees";
import {
  DUREE_FIN_MANCHE, DUREE_RALENTI, INVULNERABILITE_REAPPARITION, REGLAGES_STANDARD, type Reglages,
} from "../noyau/regles";
import { LIBRE, LOIN, SOL, STATS, carte, frappeTest, jouer, monde, perso } from "./outils";

const COUP: CoupDef = { duree: 20, hitboxes: [frappeTest()] };

function duel(reglages: Reglages = LIBRE) {
  const m = monde([perso({ neutre: COUP }), perso({ neutre: COUP })], { reglages });
  const [a, b] = m.combattants;
  return { m, a, b };
}

/** A met B K.O. (B est mis à 50 PV pour que le coup suffise). */
function koDeB(m: ReturnType<typeof duel>["m"]) {
  m.combattants[1].pv = 50;
  jouer(m, [ATTAQUE, 0]);
  jouer(m, [0, 0], 5);
}

test("pendant le décompte, personne ne peut agir", () => {
  const { m, a } = duel({ ...LIBRE, dureeDecompte: 30 });
  assert.equal(m.phase, "decompte");
  jouer(m, [ATTAQUE, 0]);
  assert.equal(a.coup, null);
  jouer(m, [0, 0], 29);
  assert.equal(m.phase, "combat");
  jouer(m, [ATTAQUE, 0]);
  assert.equal(a.coup, "neutre");
});

test("un K.O. termine la manche ; la suivante repart des points d'apparition, PV pleins", () => {
  const { m, a, b } = duel();
  jouer(m);
  koDeB(m);
  assert.equal(m.phase, "finManche");
  assert.equal(m.vainqueurManche, 0);
  assert.equal(a.victoires, 1);

  jouer(m, [0, 0], DUREE_FIN_MANCHE);
  assert.equal(m.manche, 2);
  assert.equal(m.phase, "combat", "sans décompte dans ces réglages");
  assert.deepEqual([b.pv, b.ko, b.x, b.y], [STATS.pv, false, 8000, SOL]);
  assert.deepEqual([a.x, a.coup, a.victoires], [0, null, 1], "les victoires sont conservées");
});

test("deux manches gagnées terminent la partie", () => {
  const { m } = duel();
  jouer(m);
  koDeB(m);
  jouer(m, [0, 0], DUREE_FIN_MANCHE + 1);
  koDeB(m);
  jouer(m, [0, 0], DUREE_FIN_MANCHE);
  assert.equal(m.phase, "finPartie");
  assert.equal(m.vainqueur, 0);
});

test("au chrono, la meilleure part de PV gagne ; à égalité, la manche est nulle", () => {
  const chrono = duel({ ...LIBRE, dureeManche: 100 });
  chrono.b.pv = 600;
  jouer(chrono.m, [0, 0], 100);
  assert.equal(chrono.m.phase, "finManche");
  assert.equal(chrono.m.vainqueurManche, 0);

  const nul = duel({ ...LIBRE, dureeManche: 100 });
  jouer(nul.m, [0, 0], 100);
  assert.equal(nul.m.vainqueurManche, -1);
  assert.deepEqual([nul.a.victoires, nul.b.victoires], [0, 0]);
});

test("sans vainqueur net après la dernière manche, les dégâts infligés départagent", () => {
  const { m, a, b } = duel({ ...LIBRE, dureeManche: 50, manchesMax: 1 });
  a.degatsInfliges = 120;
  b.degatsInfliges = 300;
  jouer(m, [0, 0], 50 + DUREE_FIN_MANCHE);
  assert.equal(m.phase, "finPartie");
  assert.equal(m.vainqueur, 1);

  const egalite = duel({ ...LIBRE, dureeManche: 50, manchesMax: 1 });
  jouer(egalite.m, [0, 0], 50 + DUREE_FIN_MANCHE);
  assert.equal(egalite.m.vainqueur, -1, "égalité parfaite");
});

test("une chute coûte une part des PV et fait réapparaître, invulnérable", () => {
  const zone = { gauche: -LOIN, haut: -LOIN, droite: LOIN, bas: SOL + 50_000 };
  const vide = carte({ zoneVie: zone, solides: [{ gauche: -20_000, haut: SOL, droite: 20_000, bas: SOL + 10_000 }] });
  const m = monde([perso(), perso()], { carte: vide });
  const [a] = m.combattants;
  a.x = 200_000; // au-dessus du vide
  for (let t = 0; a.pv === STATS.pv; t++) {
    assert.ok(t < 500, "jamais tombé");
    jouer(m);
  }
  assert.equal(a.pv, STATS.pv - (STATS.pv * REGLAGES_STANDARD.penaliteChute) / 1000);
  assert.deepEqual([a.x, a.y, a.ko], [0, SOL, false]);
  assert.equal(a.invulnerable, INVULNERABILITE_REAPPARITION);
  assert.ok(m.evenements.some((e) => e.type === "chute"));

  a.pv = 100;
  a.x = 200_000;
  while (!a.horsJeu) jouer(m);
  assert.equal(a.ko, true, "une chute sans assez de PV est un K.O.");
  assert.equal(m.phase, "finManche");
  assert.equal(m.vainqueurManche, 1);
});

test("la fin de manche démarre au ralenti", () => {
  const { m, b } = duel();
  jouer(m);
  koDeB(m);
  // B, K.O., glisse sous l'effet du recul : on compte les ticks où il bouge.
  const x = [b.x];
  for (let t = 0; t < DUREE_RALENTI - 1; t++) {
    jouer(m);
    x.push(b.x);
  }
  const mouvements = x.slice(1).filter((v, i) => v !== x[i]).length;
  assert.ok(mouvements <= Math.ceil(DUREE_RALENTI / 3), `${mouvements} ticks simulés sur ${DUREE_RALENTI}`);
  assert.ok(mouvements > 0);
});

test("la jauge peut être conservée d'une manche à l'autre, ou non", () => {
  for (const jaugeConservee of [true, false]) {
    const { m, a } = duel({ ...LIBRE, jaugeConservee });
    jouer(m);
    koDeB(m);
    const jauge = a.jauge;
    assert.ok(jauge > 0);
    jouer(m, [0, 0], DUREE_FIN_MANCHE);
    assert.equal(a.jauge, jaugeConservee ? jauge : 0);
  }
});
