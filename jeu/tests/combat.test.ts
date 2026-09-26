import { test } from "node:test";
import assert from "node:assert/strict";
import type { CoupDef } from "../noyau/definitions";
import { ATTAQUE, DASH, SPECIAL, ULTIME } from "../noyau/entrees";
import { appliquerStatut } from "../noyau/statuts";
import { STATS, frappeTest, jouer, monde, perso } from "./outils";

/*
 * Deux combattants face à face : A en 0 regarde à droite, B en 8000
 * regarde à gauche. Le coup de test touche B à la frame 5 (6e tick).
 */

const COUP: CoupDef = { duree: 20, hitboxes: [frappeTest()] };

function duel(coupsA: Record<string, CoupDef> = { neutre: COUP }, coupsB: Record<string, CoupDef> = {}, statsB = {}) {
  const m = monde([perso(coupsA), perso(coupsB, statsB)]);
  jouer(m); // tout le monde se pose
  const [a, b] = m.combattants;
  return { m, a, b };
}

/** A attaque (appui au premier tick) et on joue jusqu'au tick de l'impact inclus. */
function frapper(m: ReturnType<typeof duel>["m"], entreeA = ATTAQUE, entreeB = 0) {
  jouer(m, [entreeA, entreeB]);
  jouer(m, [0, 0], 5);
}

test("un coup touche : dégâts, recul vers l'arrière de la cible, hitstun, événement", () => {
  const { m, a, b } = duel();
  frapper(m);
  assert.equal(b.pv, STATS.pv - 100);
  assert.equal(b.vx, 1000, "angle 0 : recul horizontal, dans le sens de l'attaque");
  assert.equal(b.vy, 0);
  assert.equal(b.hitstun, 20);
  assert.equal(a.degatsInfliges, 100);
  const touche = m.evenements.find((e) => e.type === "touche");
  assert.ok(touche && touche.source === 0 && touche.cible === 1 && touche.valeur === 100);
});

test("le gel d'impact fige les deux combattants, puis le recul reprend", () => {
  const { m, a, b } = duel();
  frapper(m);
  const [xa, xb, frame] = [a.x, b.x, a.frame];
  jouer(m, [0, 0], 4);
  assert.deepEqual([a.x, b.x, a.frame], [xa, xb, frame], "4 ticks de gel après l'impact (gel 5)");
  jouer(m, [0, 0]);
  assert.ok(b.x > xb, "la cible repart");
  assert.ok(a.frame > frame, "le coup reprend");
});

test("en hitstun, la cible ne peut pas agir ; ensuite, si", () => {
  const { m, b } = duel({ neutre: COUP }, { neutre: { duree: 10 } });
  frapper(m);
  jouer(m, [0, 0], 8);
  jouer(m, [0, ATTAQUE]);
  assert.equal(b.coup, null, "appui ignoré pendant le hitstun");
  jouer(m, [0, 0], 30);
  jouer(m, [0, ATTAQUE]);
  assert.equal(b.coup, "neutre");
});

test("une hitbox touche une seule fois par groupe ; plusieurs groupes font plusieurs coups", () => {
  const long = frappeTest({ de: 5, a: 15, recul: 0, hitstun: 30, gel: 0 });
  const un = duel({ neutre: { duree: 20, hitboxes: [long] } });
  jouer(un.m, [ATTAQUE, 0]);
  jouer(un.m, [0, 0], 16);
  assert.equal(un.b.pv, STATS.pv - 100);

  const multi = duel({
    neutre: { duree: 30, hitboxes: [0, 1, 2].map((g) => frappeTest({ de: 5 + 6 * g, a: 5 + 6 * g, groupe: g, recul: 0, degats: 20, gel: 0 })) },
  });
  jouer(multi.m, [ATTAQUE, 0]);
  jouer(multi.m, [0, 0], 20);
  assert.equal(multi.b.pv, STATS.pv - 60);
});

test("la hitbox suit l'orientation : un coup vers la gauche projette vers la gauche", () => {
  const { m, a, b } = duel({}, { neutre: COUP });
  frapper(m, 0, ATTAQUE);
  assert.equal(a.pv, STATS.pv - 100);
  assert.equal(a.vx, -1000);
  assert.equal(b.pv, STATS.pv);
});

test("deux coups simultanés s'échangent", () => {
  const { m, a, b } = duel({ neutre: COUP }, { neutre: COUP });
  frapper(m, ATTAQUE, ATTAQUE);
  assert.equal(a.pv, STATS.pv - 100);
  assert.equal(b.pv, STATS.pv - 100);
});

test("le recul dépend de l'angle, du poids et des PV déjà perdus", () => {
  const angle = (deg: number) => {
    const d = duel({ neutre: { duree: 20, hitboxes: [frappeTest({ angle: deg })] } });
    frapper(d.m);
    return [d.b.vx, d.b.vy];
  };
  assert.deepEqual(angle(90), [0, -1000], "vers le haut");
  assert.deepEqual(angle(-90), [0, 1000], "vers le bas");
  const [vx45, vy45] = angle(45);
  assert.ok(vx45 === 707 && vy45 === -707);

  const lourd = duel({ neutre: COUP }, {}, { poids: 200 });
  frapper(lourd.m);
  assert.equal(lourd.b.vx, 500, "deux fois plus lourd, deux fois moins projeté");

  const croissance = { neutre: { duree: 20, hitboxes: [frappeTest({ croissance: 2000 })] } };
  const frais = duel(croissance);
  frapper(frais.m);
  const blesse = duel(croissance);
  blesse.b.pv = 500;
  frapper(blesse.m);
  assert.equal(frais.b.vx, 1000 + 200, "100 PV perdus sur 1000 : +10 % de la croissance");
  assert.equal(blesse.b.vx, 1000 + 1200, "600 PV perdus : +60 %");
});

test("le dash invulnérable esquive ; l'invulnérabilité ne dure qu'un instant", () => {
  // Dash immobile : seule l'invulnérabilité peut éviter le coup.
  const { m, b } = duel({ neutre: COUP }, {}, { dashInvulnerable: 12, dashVitesse: 0 });
  jouer(m, [ATTAQUE, 0]);
  jouer(m, [0, 0], 2);
  jouer(m, [0, DASH]);
  jouer(m, [0, 0], 4);
  assert.equal(b.pv, STATS.pv, "esquivé");
  jouer(m, [0, 0], 40);
  frapper(m);
  assert.equal(b.pv, STATS.pv - 100, "touché une fois l'esquive finie");
});

test("sous armure, on encaisse les dégâts sans être interrompu ni projeté", () => {
  const blinde: CoupDef = { duree: 40, armure: [0, 30] };
  const { m, b } = duel({ neutre: COUP }, { neutre: blinde });
  jouer(m, [ATTAQUE, ATTAQUE]);
  jouer(m, [0, 0], 5);
  assert.equal(b.pv, STATS.pv - 100);
  assert.equal(b.coup, "neutre");
  assert.equal(b.vx, 0);
  assert.ok(m.evenements.some((e) => e.type === "armure"));
});

test("un contre annule le coup reçu, fige l'attaquant et déclenche la riposte", () => {
  const contre: CoupDef = { duree: 30, contre: { de: 0, a: 20, riposte: "riposte" } };
  const riposte: CoupDef = { duree: 20, hitboxes: [frappeTest({ de: 2, a: 4, degats: 150 })] };
  const { m, a, b } = duel({ neutre: COUP }, { special_neutre: contre, riposte });
  jouer(m, [ATTAQUE, SPECIAL]);
  jouer(m, [0, 0], 5);
  assert.equal(b.pv, STATS.pv, "aucun dégât");
  assert.ok(a.gel > 10, "attaquant figé");
  assert.ok(m.evenements.some((e) => e.type === "contre"));
  jouer(m, [0, 0]);
  assert.equal(b.coup, "riposte");
  jouer(m, [0, 0], 4);
  assert.equal(a.pv, STATS.pv - 150);
});

test("un nouvel appui pendant la fenêtre enchaîne ; sinon, le coup s'arrête là", () => {
  const coups = {
    neutre: { duree: 20, suite: { coup: "neutre2", de: 6, a: 19 } },
    neutre2: { duree: 20 },
  };
  const { m, a } = duel(coups);
  jouer(m, [ATTAQUE, 0]);
  jouer(m, [0, 0], 7);
  jouer(m, [ATTAQUE, 0]);
  assert.equal(a.coup, "neutre2");

  const seul = duel(coups);
  jouer(seul.m, [ATTAQUE, 0]);
  jouer(seul.m, [0, 0], 25);
  assert.equal(seul.a.coup, null);
});

test("« sur touche » n'enchaîne que si le coup a touché", () => {
  const coups = {
    neutre: { duree: 30, surTouche: { coup: "suite" }, hitboxes: [frappeTest()] },
    suite: { duree: 20 },
  };
  const touche = duel(coups);
  frapper(touche.m);
  jouer(touche.m, [0, 0], 5);
  assert.equal(touche.a.coup, "suite");

  const rate = duel(coups);
  rate.b.x = 200_000;
  frapper(rate.m);
  jouer(rate.m, [0, 0], 5);
  assert.equal(rate.a.coup, "neutre");
});

test("la charge fige le coup tant que le bouton est tenu et augmente les dégâts", () => {
  const charge: CoupDef = {
    duree: 20,
    charge: { frame: 2, max: 30, bonus: 1000 },
    hitboxes: [frappeTest({ de: 5, a: 7 })],
  };
  const vite = duel({ special_neutre: charge });
  jouer(vite.m, [SPECIAL, 0]);
  jouer(vite.m, [0, 0], 8);
  assert.equal(vite.b.pv, STATS.pv - 100, "relâché aussitôt : dégâts de base");

  const pleine = duel({ special_neutre: charge });
  jouer(pleine.m, [SPECIAL, 0], 40);
  jouer(pleine.m, [0, 0], 6);
  assert.equal(pleine.b.pv, STATS.pv - 200, "pleine charge : dégâts doublés");
});

test("un spécial en recharge ne repart pas avant la fin de sa recharge", () => {
  const { m, a } = duel({ special_neutre: { duree: 10, recharge: 60 } });
  jouer(m, [SPECIAL, 0]);
  jouer(m, [0, 0], 15);
  jouer(m, [SPECIAL, 0]);
  assert.equal(a.coup, null);
  jouer(m, [0, 0], 50);
  jouer(m, [SPECIAL, 0]);
  assert.equal(a.coup, "special_neutre");
});

test("la jauge se remplit en frappant et en encaissant ; l'ultime la vide", () => {
  const ultime: CoupDef = { duree: 30, jauge: 1000, hitboxes: [frappeTest({ degats: 300 })] };
  const { m, a, b } = duel({ neutre: COUP, ultime });
  jouer(m, [ULTIME, 0]);
  assert.equal(a.coup, null, "jauge vide : ultime refusé");
  frapper(m);
  assert.equal(a.jauge, 110, "110 % des dégâts infligés");
  assert.equal(b.jauge, 50, "50 % des dégâts subis");

  jouer(m, [0, 0], 60);
  b.x = 8000; // la cible est revenue à portée
  b.vx = 0;
  a.jauge = 1000;
  jouer(m, [ULTIME, 0]);
  assert.equal(a.coup, "ultime");
  assert.equal(a.jauge, 0);
  const pv = b.pv;
  jouer(m, [0, 0], 5);
  assert.equal(b.pv, pv - 300);
  assert.equal(a.jauge, 0, "l'ultime ne recharge pas la jauge");
});

test("les statuts modifient les dégâts et bloquent les spéciaux", () => {
  const intimide = duel();
  appliquerStatut(intimide.a, "intimide");
  frapper(intimide.m);
  assert.equal(intimide.b.pv, STATS.pv - 70, "intimidé : 70 % des dégâts");

  const marque = duel();
  appliquerStatut(marque.b, "marque");
  frapper(marque.m);
  assert.equal(marque.b.pv, STATS.pv - 150, "marqué : 150 % des dégâts");
  assert.equal(marque.b.statuts.length, 0, "la marque disparaît au premier coup");

  const muet = duel({ neutre: COUP, special_neutre: { duree: 10 } });
  appliquerStatut(muet.a, "silence");
  jouer(muet.m, [SPECIAL, 0]);
  assert.equal(muet.a.coup, null, "réduit au silence : pas de spécial");
  jouer(muet.m, [ATTAQUE, 0]);
  assert.equal(muet.a.coup, "neutre", "les attaques normales restent possibles");
});

test("à 0 PV, le combattant est K.O. et ne peut plus agir", () => {
  const { m, b } = duel({ neutre: COUP }, { neutre: { duree: 10 } });
  b.pv = 50;
  frapper(m);
  assert.equal(b.pv, 0);
  assert.equal(b.ko, true);
  assert.ok(m.evenements.some((e) => e.type === "ko" && e.cible === 1));
  jouer(m, [0, ATTAQUE]);
  assert.equal(b.coup, null);
});
