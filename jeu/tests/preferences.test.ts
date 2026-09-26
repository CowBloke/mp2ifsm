import { test } from "node:test";
import assert from "node:assert/strict";
import { PREFERENCES_DEFAUT, chargerPreferences, enregistrerPreferences } from "../client/reglages";
import { creerSons } from "../client/son/sons";
import { nomsDistincts } from "../client/noms";

/*
 * Préférences du joueur (volume, secousses) : relues telles qu'écrites,
 * et jamais une valeur absurde venue du stockage. Sans navigateur, le son
 * se tait sans rien casser.
 */

function avecStockage(valeurs: Record<string, string>, f: () => void) {
  const avant = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => valeurs[k] ?? null,
    setItem: (k: string, v: string) => { valeurs[k] = v; },
  };
  try {
    f();
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = avant;
  }
}

test("préférences : valeurs par défaut sans stockage, relues après enregistrement", () => {
  assert.deepEqual(chargerPreferences(), PREFERENCES_DEFAUT, "pas de localStorage (Node) : défauts");
  avecStockage({}, () => {
    assert.deepEqual(chargerPreferences(), PREFERENCES_DEFAUT);
    enregistrerPreferences({ volume: 0.25, secousses: false });
    assert.deepEqual(chargerPreferences(), { volume: 0.25, secousses: false });
  });
});

test("préférences : un stockage corrompu ou hors bornes retombe sur les défauts", () => {
  const cle = "taupe-fighter:preferences";
  avecStockage({ [cle]: "{pas du json" }, () => assert.deepEqual(chargerPreferences(), PREFERENCES_DEFAUT));
  avecStockage({ [cle]: JSON.stringify({ volume: 7, secousses: "oui" }) }, () => {
    assert.deepEqual(chargerPreferences(), PREFERENCES_DEFAUT);
  });
  avecStockage({ [cle]: JSON.stringify({ volume: 0 }) }, () => {
    assert.deepEqual(chargerPreferences(), { volume: 0, secousses: true }, "muet est un choix valable");
  });
});

test("sans Web Audio, les sons se taisent sans erreur", () => {
  const sons = creerSons();
  sons.volume(0.5);
  sons.detruire();
});

test("noms affichés : les homonymes sont numérotés, sans créer de nouveau doublon", () => {
  assert.deepEqual(nomsDistincts(["Léa", "Bot moyen", "Bot moyen", "Bot moyen"]), ["Léa", "Bot moyen", "Bot moyen 2", "Bot moyen 3"]);
  assert.deepEqual(nomsDistincts(["A", "A 2", "A"]), ["A", "A 2", "A 3"]);
  assert.deepEqual(nomsDistincts(["Seul"]), ["Seul"]);
});
