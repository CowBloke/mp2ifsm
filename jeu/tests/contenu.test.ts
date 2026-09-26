import { test } from "node:test";
import assert from "node:assert/strict";
import { deplacementY, horsDe } from "../noyau/collisions";
import { CARTES, PERSOS, TOUS_LES_PERSOS } from "../noyau/contenu";
import type { CoupDef } from "../noyau/definitions";
import { STATUTS } from "../noyau/statuts";
import { valeursEntieres } from "./outils";

/*
 * Validation de tout le contenu : chaque personnage et chaque carte,
 * présents et futurs, doivent passer ces contrôles.
 */

const OBLIGATOIRES = ["neutre", "cote", "haut", "bas", "air_neutre", "special_neutre", "special_haut", "ultime"];

function fenetre(nom: string, de: number, a: number, coup: CoupDef) {
  assert.ok(Number.isInteger(de) && Number.isInteger(a), `${nom} : frames entières`);
  assert.ok(de >= 0 && de <= a && a < coup.duree, `${nom} : fenêtre [${de}, ${a}] hors du coup (durée ${coup.duree})`);
}

for (const perso of TOUS_LES_PERSOS) {
  test(`${perso.nom} : données cohérentes`, () => {
    const s = perso.stats;
    for (const [cle, v] of Object.entries(s)) assert.ok(Number.isSafeInteger(v) && v >= 0, `stat ${cle}`);
    assert.ok(s.pv > 0 && s.poids > 0 && s.largeur > 0 && s.hauteur > 0);
    assert.equal(valeursEntieres(perso.coups), null, "valeurs entières");
    for (const e of OBLIGATOIRES) assert.ok(perso.coups[e], `emplacement « ${e} » manquant`);
    assert.ok((perso.coups.ultime.jauge ?? 0) > 0, "l'ultime coûte de la jauge");

    for (const [id, coup] of Object.entries(perso.coups)) {
      const nom = `${perso.id}.${id}`;
      assert.ok(Number.isInteger(coup.duree) && coup.duree > 0, `${nom} : durée`);
      for (const hb of coup.hitboxes ?? []) {
        fenetre(`${nom} (hitbox)`, hb.de, hb.a, coup);
        assert.ok(hb.l > 0 && hb.h > 0 && hb.degats >= 0 && hb.hitstun >= 0, `${nom} : hitbox`);
        assert.ok(hb.angle >= -180 && hb.angle <= 180, `${nom} : angle`);
        if (hb.statut) assert.ok(STATUTS[hb.statut], `${nom} : statut ${hb.statut} inconnu`);
      }
      for (const m of coup.mouvement ?? []) fenetre(`${nom} (mouvement)`, m.de, m.a, coup);
      if (coup.suite) {
        assert.ok(perso.coups[coup.suite.coup], `${nom} : suite ${coup.suite.coup} inconnue`);
        fenetre(`${nom} (suite)`, coup.suite.de, coup.suite.a, coup);
      }
      if (coup.surTouche) assert.ok(perso.coups[coup.surTouche.coup], `${nom} : surTouche inconnu`);
      if (coup.contre) {
        assert.ok(perso.coups[coup.contre.riposte], `${nom} : riposte inconnue`);
        fenetre(`${nom} (contre)`, coup.contre.de, coup.contre.a, coup);
      }
      if (coup.armure) fenetre(`${nom} (armure)`, coup.armure[0], coup.armure[1], coup);
      if (coup.invulnerable) fenetre(`${nom} (invulnérabilité)`, coup.invulnerable[0], coup.invulnerable[1], coup);
      if (coup.charge) {
        assert.ok(coup.charge.frame < coup.duree && coup.charge.max > 0, `${nom} : charge`);
        assert.ok(!(coup.hitboxes ?? []).some((hb) => hb.de <= coup.charge!.frame && coup.charge!.frame <= hb.a),
          `${nom} : pas de hitbox active pendant la charge`);
      }
      for (const st of coup.statutsSoi ?? []) {
        assert.ok(STATUTS[st.statut], `${nom} : statut ${st.statut} inconnu`);
        assert.ok(st.frame < coup.duree);
      }
      for (const e of coup.entites ?? []) {
        const def = perso.entites?.[e.id];
        assert.ok(def, `${nom} : entité « ${e.id} » inconnue`);
        assert.ok(e.frame < coup.duree, `${nom} : entité lancée après la fin du coup`);
        // Un objet qui heurte le décor naît au-dessus des pieds du lanceur :
        // posé à cheval sur le sol, il le traverserait.
        if ((def.solides ?? "traverser") !== "traverser") assert.ok(e.y >= def.h / 2, `${nom} : « ${e.id} » naît dans le sol`);
      }
    }

    for (const [id, e] of Object.entries(perso.entites ?? {})) {
      const nom = `${perso.id}.entite.${id}`;
      assert.ok(e.l > 0 && e.h > 0 && e.duree > 0, `${nom} : taille et durée`);
      if (e.surFin) assert.ok(perso.entites?.[e.surFin], `${nom} : surFin « ${e.surFin} » inconnue`);
      if (e.touche?.statut) assert.ok(STATUTS[e.touche.statut], `${nom} : statut inconnu`);
      if (e.grappin) assert.ok((e.solides ?? "arreter") !== "traverser", `${nom} : un grappin doit s'accrocher`);
      // Une entité doit pouvoir servir : touche, déclencher, attirer, tirer ou protéger.
      assert.ok(e.touche || e.declencheur || e.attraction || e.grappin || e.bouclier, `${nom} : sans effet`);
    }
  });
}

test("chaque personnage jouable a sa fiche de présentation, et les identifiants sont uniques", () => {
  for (const p of PERSOS) {
    assert.ok(p.fiche, `${p.nom} : fiche manquante`);
    assert.ok(p.fiche.role.length > 0 && p.fiche.role.length <= 32, `${p.nom} : rôle vide ou trop long`);
    assert.ok(p.fiche.resume.length >= 20 && p.fiche.resume.length <= 140, `${p.nom} : résumé de 20 à 140 caractères`);
    assert.ok(Number.isInteger(p.fiche.couleur) && p.fiche.couleur >= 0 && p.fiche.couleur <= 0xffffff, `${p.nom} : couleur`);
  }
  const ids = TOUS_LES_PERSOS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "deux personnages ont le même identifiant");
  assert.ok(ids.every((id) => /^[a-z][a-z0-9_]*$/.test(id)), "identifiants en minuscules, sans espace");
});

for (const carte of CARTES) {
  test(`carte « ${carte.nom} » : apparitions posées, dans la zone de vie`, () => {
    assert.ok(carte.apparitions.length >= 4, "quatre places au moins");
    assert.ok(!horsDe(carte.limites, carte.zoneVie), "limites de caméra dans la zone de vie");
    for (const p of carte.apparitions) {
      const pieds = { gauche: p.x - 2000, haut: p.y - 10_000, droite: p.x + 2000, bas: p.y };
      assert.equal(deplacementY(pieds, 1, carte.solides, carte.plateformes), 0, `apparition (${p.x}, ${p.y}) sans sol`);
      for (const s of carte.solides) {
        assert.ok(pieds.bas <= s.haut || pieds.haut >= s.bas || pieds.droite <= s.gauche || pieds.gauche >= s.droite,
          "apparition dans un bloc");
      }
    }
  });
}
