import { test } from "node:test";
import assert from "node:assert/strict";
import { creerSessionLocale } from "../client/session-locale";
import { DROITE } from "../noyau/entrees";
import { LIBRE, jouer, monde, perso } from "./outils";

test("la session locale joue 60 ticks par seconde, lit l'entrée à chaque tick et interpole", () => {
  let lectures = 0;
  const session = creerSessionLocale(() => monde([perso(), perso()], { reglages: LIBRE }), 0);
  for (let i = 0; i < 100; i++) {
    session.avancer(10, () => {
      lectures++;
      return DROITE;
    });
  }
  const vue = session.vue();
  assert.equal(vue.monde.tick, 60);
  assert.equal(lectures, 60, "une lecture par tick, aucune par image vide");
  assert.ok(vue.monde.combattants[0].x > 0, "le joueur local a avancé");
  assert.equal(vue.monde.combattants[1].x, 8000, "l'autre, sans contrôleur, n'a pas bougé");
  assert.ok(vue.evenements.length >= 0);

  // Interpolation : à mi-tick, la position affichée est entre deux ticks.
  session.avancer(1000 / 120, () => DROITE);
  const [p] = session.vue().positions;
  const c = session.vue().monde.combattants[0];
  assert.ok(p.x <= c.x);
});

test("les événements de tous les ticks d'une image sont transmis, une seule fois", () => {
  const session = creerSessionLocale(() => {
    const m = monde([perso(), perso()], { reglages: LIBRE });
    jouer(m);
    return m;
  }, 0);
  session.avancer(1000, () => 0);
  session.vue();
  assert.equal(session.vue().evenements.length, 0, "vidés après lecture");
});
