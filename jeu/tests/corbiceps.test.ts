import { test } from "node:test";
import assert from "node:assert/strict";
import { px } from "../noyau/constantes";
import { CORBICEPS } from "../noyau/contenu/persos/corbiceps";
import { MANNEQUIN } from "../noyau/contenu/persos/mannequin";
import { ATTAQUE, BAS, HAUT, SPECIAL, ULTIME, type Entree } from "../noyau/entrees";
import { SOL, carte, jouer, monde } from "./outils";

/*
 * Mr Corbiceps sur le terrain : ses signatures fonctionnent contre un
 * mannequin immobile. Les assertions portent sur des propriétés (ça
 * enchaîne, ça remonte, ça fait plus mal chargé) plutôt que sur des
 * valeurs exactes, pour laisser régler l'équilibrage.
 */

/** Corbiceps en 0 face au mannequin placé à `distance` pixels. */
function face(distance = 70) {
  const m = monde([CORBICEPS, MANNEQUIN], {
    carte: carte({ apparitions: [{ x: 0, y: SOL }, { x: px(distance), y: SOL }] }),
  });
  jouer(m);
  const [corbi, cible] = m.combattants;
  return { m, corbi, cible };
}

/** Rejoue une séquence d'entrées pour Corbiceps, le mannequin ne fait rien. */
function sequence(m: ReturnType<typeof face>["m"], entrees: Entree[]) {
  for (const e of entrees) jouer(m, [e, 0]);
}

/** Appuis répétés (un tick sur deux) pendant `ticks` ticks. */
function marteler(bouton: Entree, ticks: number): Entree[] {
  return Array.from({ length: ticks }, (_, i) => (i % 2 === 0 ? bouton : 0));
}

test("« oui, non, non, oui » : les quatre coups s'enchaînent et le dernier projette", () => {
  const { m, cible } = face();
  const coups: string[] = [];
  for (const e of marteler(ATTAQUE, 110)) {
    jouer(m, [e, 0]);
    for (const ev of m.evenements) if (ev.type === "touche") coups.push(ev.cle);
  }
  assert.deepEqual(coups, ["neutre", "neutre2", "neutre3", "neutre4"]);
  assert.equal(cible.pv, MANNEQUIN.stats.pv - (36 + 36 + 40 + 90));
});

test("le plaquage est en armure pendant son élan, avant même de frapper", () => {
  const cote = CORBICEPS.coups.cote;
  const premiere = Math.min(...(cote.hitboxes ?? []).map((hb) => hb.de));
  assert.ok(cote.armure && cote.armure[0] <= premiere, "armure dès le début de l'élan");
});

test("le saut de ligne fait remonter nettement plus haut qu'un saut", () => {
  const vide = monde([CORBICEPS], { carte: carte({ solides: [], apparitions: [{ x: 0, y: 0 }] }) });
  const [c] = vide.combattants;
  sequence(vide, [SPECIAL | HAUT]);
  let plusHaut = c.y;
  for (let t = 0; t < 40; t++) {
    jouer(vide);
    plusHaut = Math.min(plusHaut, c.y);
  }
  assert.ok(-plusHaut > px(200), `remonte de ${-plusHaut / 100} px`);
});

test("∏ chargé à fond fait au moins deux fois plus mal que relâché aussitôt", () => {
  const vite = face(85);
  sequence(vite.m, [SPECIAL, ...Array(30).fill(0)]);
  const base = MANNEQUIN.stats.pv - vite.cible.pv;

  const charge = face(85);
  sequence(charge.m, [...Array(80).fill(SPECIAL), ...Array(20).fill(0)]);
  const plein = MANNEQUIN.stats.pv - charge.cible.pv;
  assert.ok(base > 0 && plein >= 2 * base, `${base} puis ${plein}`);
});

test("« Non. » : contré, le mannequin prend la riposte et Corbiceps rien", () => {
  const { m, corbi, cible } = face();
  jouer(m, [SPECIAL | BAS, 0]);
  jouer(m, [0, ATTAQUE]);
  for (let t = 0; t < 40; t++) jouer(m, [0, 0]);
  assert.equal(corbi.pv, CORBICEPS.stats.pv);
  assert.ok(MANNEQUIN.stats.pv - cible.pv >= 120, "la riposte a touché");
});

test("la série divergente : l'ultime enchaîne sa série et fait très mal", () => {
  const { m, corbi, cible } = face();
  corbi.jauge = 1000;
  const touches: number[] = [];
  jouer(m, [ULTIME, 0]);
  for (let t = 0; t < 200; t++) {
    jouer(m, [0, 0]);
    for (const e of m.evenements) if (e.type === "touche" && e.source === 0) touches.push(e.valeur);
  }
  assert.ok(touches.length >= 6, `${touches.length} coups portés`);
  assert.ok(touches.reduce((a, b) => a + b, 0) >= 400, "au moins 400 dégâts");
  assert.equal(corbi.jauge, 0, "la jauge a été dépensée et l'ultime ne la recharge pas");
});
