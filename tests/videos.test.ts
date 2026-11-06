import { test } from "node:test";
import assert from "node:assert/strict";
import { couperTexte, filtreCss, filtreFfmpeg, lireMontage, dureeTotale, vignetteCss, FILTRES, MUSIQUES } from "../src/lib/videos-montage";
import { grapheFiltres } from "../src/lib/videos-rendu";

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
    const chaine = filtreFfmpeg(k);
    assert.equal(chaine.length, FILTRES[k].fonctions.length + (FILTRES[k].vignette ? 2 : 0));
    for (const f of chaine.slice(0, FILTRES[k].fonctions.length)) assert.match(f, /^(colorchannelmixer|lutrgb)=[\w=.:\-()\\,*+ ]+$/);
    assert.equal(vignetteCss(k) !== undefined, !!FILTRES[k].vignette);
  }
  // colorchannelmixer n'accepte que des coefficients dans [−2, 2].
  for (const k of Object.keys(FILTRES)) for (const f of filtreFfmpeg(k)) {
    for (const [, v] of f.matchAll(/=(-?[\d.]+)/g)) if (f.startsWith("colorchannelmixer")) assert.ok(Math.abs(Number(v)) <= 2, `${k} : ${v}`);
  }
  assert.match(filtreCss("pop"), /hue-rotate\(-8deg\)/);
  assert.deepEqual(filtreFfmpeg("vintage").slice(-2), ["format=rgb24", "vignette"]);
  // invert : 255 − x.
  assert.match(filtreFfmpeg("negatif")[0], /clip\(val\*-1\+255/);
  // hue-rotate de 0° = identité.
  assert.ok(Math.abs(Number(/rr=([\d.-]+)/.exec(filtreFfmpeg("pop")[2])![1]) - 1) < 0.1);
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

test("filtre par clip et musique : validation", () => {
  const m = lireMontage({ ...base, clips: [{ source: 0, debut: 0, fin: 5, muet: false, filtre: "vintage" }, base.clips[1]] }, 2);
  assert.ok(m);
  assert.deepEqual(m.clips.map((c) => c.filtre), ["vintage", "aucun"]);
  assert.equal(m.musique, null);
  assert.equal(lireMontage({ ...base, clips: [{ ...base.clips[0], filtre: "x" }] }, 2), null);

  const mu = { cle: "lofi", titre: "Lo-fi révision", debut: 3, volume: 0.8, voix: 0.6 };
  assert.equal(lireMontage({ ...base, musique: mu }, 2)?.musique?.cle, "lofi");
  assert.equal(lireMontage({ ...base, musique: { ...mu, source: 1 } }, 2)?.musique?.source, undefined);
  assert.equal(lireMontage({ ...base, musique: { ...mu, cle: "inconnue" } }, 2), null);
  assert.equal(lireMontage({ ...base, musique: { ...mu, volume: 2 } }, 2), null);
  // « perso » exige le fichier ; sa source est fixée par le serveur.
  assert.equal(lireMontage({ ...base, musique: { ...mu, cle: "perso" } }, 2), null);
  assert.equal(lireMontage({ ...base, musique: { ...mu, cle: "perso", source: 0 } }, 2, 2)?.musique?.source, 2);
  assert.ok(Object.keys(MUSIQUES).length >= 4);
});

test("graphe ffmpeg : filtre par clip, musique mixée", () => {
  const m = lireMontage({ ...base, clips: [{ ...base.clips[0], filtre: "nb" }, base.clips[1]],
    musique: { cle: "piano", titre: "Piano calme", debut: 2, volume: 0.5, voix: 1 } }, 2)!;
  const sans = grapheFiltres(m, [true, false], 720, 1280, () => "t", "f.ttf");
  assert.match(sans, /\[0:v\][^;]*colorchannelmixer[^;]*\[v0\]/);
  assert.doesNotMatch(sans, /\[1:v\][^;]*colorchannelmixer/);
  assert.doesNotMatch(sans, /amix/);
  const avec = grapheFiltres(m, [true, false], 720, 1280, () => "t", "f.ttf", true);
  assert.match(avec, /\[2:a\]atrim=start=2,/);
  assert.match(avec, /volume=0\.5,afade=t=out:st=5\.5:d=1\.5\[mus\]/);
  assert.match(avec, /amix=inputs=2[^;]*\[aout\]/);
});
