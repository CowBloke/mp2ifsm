import { test } from "node:test";
import assert from "node:assert/strict";
import { PERSOS } from "../noyau/contenu";
import { tournoi } from "../outils/arene";

/*
 * Garde-fou d'équilibrage, à bornes larges : entre bots, aucun duel
 * n'est à sens unique et chaque personnage gagne une part raisonnable de
 * ses parties. Un personnage ajouté ou retouché qui ne peut pas gagner
 * (ou ne peut pas perdre) fait échouer ce test. L'équilibrage fin se
 * fait avec `npm run jeu:equilibrage` et, surtout, entre humains.
 */

test("équilibre entre bots : pas de duel à sens unique, pas de personnage perdant", () => {
  const t = tournoi(PERSOS, { niveau: 2, parties: 12 });
  for (const d of t.duels) {
    const part = d.victoiresA / d.parties;
    assert.ok(part >= 0.1 && part <= 0.9, `${d.a} contre ${d.b} : ${Math.round(100 * part)} % (attendu entre 10 et 90 %)`);
  }
  for (const p of PERSOS) {
    const part = (t.victoires[p.id] ?? 0) / t.jouees[p.id];
    assert.ok(part >= 0.25 && part <= 0.75, `${p.nom} gagne ${Math.round(100 * part)} % de ses parties (attendu entre 25 et 75 %)`);
  }
  assert.ok(t.dureeMoyenneS > 30 && t.dureeMoyenneS < 240, `parties de ${Math.round(t.dureeMoyenneS)} s en moyenne`);
});
