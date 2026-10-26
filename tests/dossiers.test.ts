import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chemin, construireArbre, descendants, destinations, hauteur, libelleChemin,
} from "../src/lib/arbre-dossiers";

const d = (id: number, parent_id: number | null, nom: string, subject_id: number | null = 1) =>
  ({ id, parent_id, subject_id, nom });

// Maths ─ Analyse ─ Séries ─ Critères
//       └ Algèbre
// Physique
const dossiers = [
  d(1, null, "Maths"), d(2, 1, "Analyse"), d(3, 2, "Séries"), d(4, 3, "Critères"),
  d(5, 1, "Algèbre"), d(6, null, "Physique", 2),
];

test("l'arbre est trié naturellement (Chapitre 2 avant Chapitre 10)", () => {
  const arbre = construireArbre([d(1, null, "Chapitre 10"), d(2, null, "Chapitre 2"), d(3, null, "Annexes")]);
  assert.deepEqual(arbre.map((n) => n.nom), ["Annexes", "Chapitre 2", "Chapitre 10"]);
});

test("les racines suivent le rang de leur matière avant le nom", () => {
  const arbre = construireArbre([
    { ...d(1, null, "A"), rang: 20 }, { ...d(2, null, "Z"), rang: 10 },
  ]);
  assert.deepEqual(arbre.map((n) => n.nom), ["Z", "A"]);
});

test("chemin : de la racine au dossier, vide si inconnu", () => {
  assert.deepEqual(chemin(dossiers, 4).map((x) => x.id), [1, 2, 3, 4]);
  assert.deepEqual(chemin(dossiers, null), []);
  assert.deepEqual(chemin(dossiers, 99), []);
  assert.equal(libelleChemin(dossiers, 3), "Maths › Analyse › Séries");
});

test("chemin ne boucle pas sur des données cycliques", () => {
  assert.ok(chemin([d(1, 2, "a"), d(2, 1, "b")], 1).length <= 2);
});

test("descendants et hauteur", () => {
  assert.deepEqual([...descendants(dossiers, 1)].sort(), [2, 3, 4, 5]);
  assert.equal(descendants(dossiers, 6).size, 0);
  assert.equal(hauteur(dossiers, 1), 4);
  assert.equal(hauteur(dossiers, 6), 1);
});

test("destinations d'un élément : toute l'arborescence, indentée", () => {
  const o = destinations(dossiers);
  assert.deepEqual(o.map((x) => [x.id, x.niveau]),
    [[null, 0], [1, 1], [5, 2], [2, 2], [3, 3], [4, 4], [6, 1]]);
});

test("déplacer un dossier : jamais dans lui-même ni dans son contenu", () => {
  // « Analyse » (hauteur 3) ne peut aller que sous Maths ou Physique :
  // sous « Algèbre » (niveau 2) elle ferait 5 niveaux.
  const ids = destinations(dossiers, { deplace: 2 }).map((x) => x.id);
  assert.deepEqual(ids, [null, 1, 6]);
});

test("déplacer un dossier profond écarte les destinations trop basses", () => {
  const ids = destinations(dossiers, { deplace: 2 }).map((x) => x.id);
  assert.ok(ids.includes(6) && !ids.includes(5));
  // Un dossier simple se range partout sauf sous un dossier de niveau 4.
  const simple = destinations(dossiers, { deplace: 6 }).map((x) => x.id);
  assert.ok(simple.includes(3) && !simple.includes(4));
});

test("les racines d'un menu de paquets portent le nom de leur matière", () => {
  const o = destinations([{ ...d(1, null, "Chapitre 1"), matiere: "Maths" }, d(2, 1, "Cours")],
    { avecMatiere: true });
  assert.deepEqual(o.map((x) => x.libelle), ["Aucun dossier", "Maths › Chapitre 1", "Cours"]);
});
