import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO, creerDemo, mondeApercu } from "../client/apercu";
import { PERSOS } from "../noyau/contenu";
import { avancerMonde } from "../noyau/monde";

/*
 * Démonstration des menus : chaque personnage y montre vraiment ses
 * coups (ils partent, touchent le mannequin, l'ultime compris), et la
 * boucle tourne indéfiniment sans que la partie s'arrête.
 */

const CYCLE = 40 + DEMO.reduce((s, e) => s + e.attente + 1, 0);

for (const perso of PERSOS) {
  test(`aperçu de ${perso.nom} : ses coups partent et touchent, en boucle`, () => {
    const monde = mondeApercu(perso.id);
    const demo = creerDemo();
    const coups = new Set<string>();
    let touches = 0;
    for (let t = 0; t < CYCLE * 2; t++) {
      avancerMonde(monde, [demo(monde, 0), 0]);
      for (const e of monde.evenements) {
        if (e.type === "coup" && e.source === 0) coups.add(e.cle);
        if (e.type === "touche" && e.source === 0) touches++;
      }
    }
    for (const id of ["neutre", "cote", "haut", "bas", "special_neutre", "ultime"]) {
      assert.ok(coups.has(id) || [...coups].some((c) => c.startsWith(`${id}`)), `${perso.nom} : « ${id} » jamais montré (${[...coups].join(", ")})`);
    }
    assert.ok(touches >= 8, `${perso.nom} : seulement ${touches} touches sur le mannequin`);
    const suite = perso.coups.ultime?.surTouche?.coup;
    if (suite) assert.ok(coups.has(suite), `${perso.nom} : l'ultime doit toucher pour montrer « ${suite} »`);
    assert.equal(monde.phase, "combat", "la démonstration ne termine jamais la manche");
    assert.ok(!monde.combattants[0].horsJeu && Math.abs(monde.combattants[0].x - monde.carte.apparitions[0].x) < 60_000,
      "le personnage reste au centre de la scène");
  });
}
