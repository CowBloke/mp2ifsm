import { test } from "node:test";
import assert from "node:assert/strict";
import { PERSOS, TOUS_LES_PERSOS } from "../noyau/contenu";
import { apparenceDe } from "../client/persos";
import { POSE_NEUTRE, completer, echantillonner, melanger } from "../client/persos/pose";

/*
 * Apparences : chaque animation et chaque effet se rattache à un coup
 * existant, et les images clés restent dans la durée du coup — sinon
 * l'animation et la hitbox ne correspondraient plus.
 */

const MEMBRES = new Set(["poingAv", "poingAr", "piedAv", "piedAr", "tete", "torse"]);

test("chaque personnage jouable a son apparence propre", () => {
  for (const p of PERSOS) assert.equal(apparenceDe(p.id).id, p.id, `${p.nom} utilise l'apparence de repli`);
});

test("chaque entité d'un personnage jouable a son dessin, et aucun dessin n'est orphelin", () => {
  for (const p of PERSOS) {
    const dessins = apparenceDe(p.id).entites ?? {};
    for (const id of Object.keys(p.entites ?? {})) assert.ok(dessins[id], `${p.nom} : entité « ${id} » sans dessin`);
    for (const id of Object.keys(dessins)) assert.ok(p.entites?.[id], `${p.nom} : dessin « ${id} » sans entité`);
  }
});

test("chaque coup d'un personnage jouable a son animation", () => {
  for (const p of PERSOS) {
    const ap = apparenceDe(p.id);
    for (const id of Object.keys(p.coups)) assert.ok(ap.animations[id], `${p.nom} : coup « ${id} » sans animation`);
  }
});

for (const perso of TOUS_LES_PERSOS) {
  test(`${perso.nom} : animations et effets calés sur ses coups`, () => {
    const ap = apparenceDe(perso.id);
    if (ap.id !== perso.id) return;
    assert.ok(ap.palettes.length >= 2, "au moins deux palettes (duels miroirs)");
    for (const [id, cles] of Object.entries(ap.animations)) {
      const coup = perso.coups[id];
      assert.ok(coup, `animation « ${id} » sans coup`);
      for (let i = 1; i < cles.length; i++) assert.ok(cles[i].f >= cles[i - 1].f, `${id} : images clés dans l'ordre`);
      assert.ok(cles[cles.length - 1].f <= coup.duree, `${id} : image clé après la fin du coup`);
    }
    for (const [id, effet] of Object.entries(ap.effets)) {
      const coup = perso.coups[id];
      assert.ok(coup, `effet « ${id} » sans coup`);
      for (const t of effet.textes ?? []) {
        assert.ok(t.f < coup.duree && MEMBRES.has(t.membre), `${id} : texte « ${t.texte} »`);
        assert.ok(t.texte.length <= 10, `${id} : « ${t.texte} » trop long pour rester discret`);
      }
      for (const m of effet.trainee ?? []) assert.ok(MEMBRES.has(m), `${id} : membre ${m}`);
      if (effet.onde !== undefined) assert.ok(effet.onde < coup.duree);
      if (effet.accessoire) assert.ok(ap.dessins.accessoires?.[effet.accessoire], `${id} : accessoire inconnu`);
    }
  });
}

test("échantillonner des images clés : bornes, interpolation, compléments", () => {
  const base = completer(POSE_NEUTRE, { torse: 10 });
  const cles = [{ f: 0, p: { brasAv: [0, 0] as [number, number] } }, { f: 10, p: { brasAv: [90, 0] as [number, number] } }];
  assert.deepEqual(echantillonner(cles, -5, base).brasAv, [0, 0]);
  assert.deepEqual(echantillonner(cles, 50, base).brasAv, [90, 0]);
  const milieu = echantillonner(cles, 5, base);
  assert.ok(milieu.brasAv[0] > 45 && milieu.brasAv[0] < 90, "démarrage vif : plus de la moitié du chemin à mi-temps");
  assert.equal(milieu.torse, 10, "les champs absents viennent de la base");
  assert.deepEqual(melanger(base, completer(base, { torse: 30 }), 0.5).torse, 20);
});
