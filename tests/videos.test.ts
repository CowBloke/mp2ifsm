import { test } from "node:test";
import assert from "node:assert/strict";
import { couperTexte, filtreCss, filtreFfmpeg, lireMontage, dureeTotale, FILTRES } from "../src/lib/videos-montage";

const base = {
  clips: [{ source: 0, debut: 0, fin: 5, muet: false }, { source: 1, debut: 1, fin: 3, muet: true }],
  filtre: "aucun", textes: [], couverture: 0,
};

test("lireMontage valide et borne le montage", () => {
  const m = lireMontage({ ...base, textes: [{ texte: " Titre ", debut: 6, fin: 20, position: "haut", taille: "m", fond: true }], couverture: 99 }, 2);
  assert.ok(m);
  assert.equal(dureeTotale(m), 7);
  assert.deepEqual([m.textes[0].texte, m.textes[0].debut, m.textes[0].fin], ["Titre", 6, 7]);
  assert.ok(m.couverture < 7);
});

test("lireMontage refuse source absente, clip vide, filtre inconnu, durée > 3 min", () => {
  assert.equal(lireMontage(base, 1), null);
  assert.equal(lireMontage({ ...base, clips: [{ source: 0, debut: 2, fin: 2.1, muet: false }] }, 2), null);
  assert.equal(lireMontage({ ...base, filtre: "x;rm" }, 2), null);
  assert.equal(lireMontage({ ...base, clips: [{ source: 0, debut: 0, fin: 200, muet: false }] }, 2), null);
  assert.equal(lireMontage({ ...base, clips: [] }, 2), null);
  assert.equal(lireMontage("nope", 2), null);
});

test("filtres : CSS et ffmpeg dérivés de la même définition", () => {
  assert.equal(filtreCss("aucun"), "none");
  assert.deepEqual(filtreFfmpeg("aucun"), []);
  for (const k of Object.keys(FILTRES)) {
    assert.equal(filtreFfmpeg(k).length, FILTRES[k].fonctions.length);
    for (const f of filtreFfmpeg(k)) assert.match(f, /^(colorchannelmixer|lutrgb)=[\w=.:\-()\\,*+ ]+$/);
  }
  // Niveaux de gris complet : chaque canal reçoit les coefficients de luminance.
  assert.match(filtreFfmpeg("nb")[0], /rr=0\.2126:rg=0\.7152:rb=0\.0722/);
});

test("couperTexte coupe aux mots et borne les lignes", () => {
  const l = couperTexte("Le théorème des accroissements finis dit que la pente moyenne est atteinte", "m", 720, 720);
  assert.ok(l.length > 1);
  assert.ok(l.every((x) => x.length <= Math.floor((720 * 0.86) / (720 * 0.062 * 0.66))));
  assert.equal(l.join(" "), "Le théorème des accroissements finis dit que la pente moyenne est atteinte");
  assert.ok(couperTexte("x".repeat(500), "l", 720, 720).length <= 6);
  assert.deepEqual(couperTexte("a\nb", "s", 720, 720), ["a", "b"]);
});
