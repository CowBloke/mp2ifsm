import { Container, Graphics, Text } from "pixi.js";
import type { Combattant } from "../../noyau/combattant";
import { SOUS_PIXELS } from "../../noyau/constantes";
import { coupDe, dans } from "../../noyau/coups";
import type { Evenement } from "../../noyau/evenements";
import type { Monde } from "../../noyau/monde";
import { animer, creerEtatAnimation } from "../persos/animateur";
import { apparenceDe } from "../persos";
import { creerRig } from "../persos/rig";
import type { Apparence } from "../persos/types";
import { POLICE } from "./couleurs";
import type { Effets } from "./effets";
import { POLICE_MATHS, type Textes } from "./textes";
import type { Trainees } from "./trainees";

/*
 * Vue d'un combattant : squelette animé, ombre, étiquette, et les effets
 * attachés à ses coups (textes, traînées, ondes, emblème d'ultime). Elle
 * lit l'état de simulation sans jamais le modifier.
 */

const px = (u: number) => u / SOUS_PIXELS;
const DUREE_FLASH = 80;

/** Ce que les vues partagent : le repère du monde et les systèmes d'effets. */
export type ContexteEffets = {
  monde: Container;
  /** Couche derrière tous les combattants (emblèmes d'ultime). */
  arriere: Container;
  textes: Textes;
  trainees: Trainees;
  effets: Effets;
};

export type VueCombattant = {
  conteneur: Container;
  apparence: Apparence;
  maj(c: Combattant, monde: Monde, x: number, y: number, alpha: number, dtMs: number): void;
  flash(): void;
  /** Ce combattant vient de toucher (événement « touche » dont il est la source). */
  touche(e: Evenement): void;
  /** Ce combattant vient de contrer. */
  contre(e: Evenement): void;
  detruire(): void;
};

/** Fenêtre de frames autour des hitboxes : c'est là que les traînées se voient. */
function fenetreActive(c: Combattant): [number, number] {
  const coup = coupDe(c);
  const hbs = coup?.hitboxes ?? [];
  if (hbs.length === 0) return [0, coup?.duree ?? 0];
  return [Math.min(...hbs.map((h) => h.de)) - 2, Math.max(...hbs.map((h) => h.a)) + 1];
}

export function creerVueCombattant(c: Combattant, variante: number, couleur: number, etiquette: string,
  ctx: ContexteEffets): VueCombattant {
  const ap = apparenceDe(c.perso.id);
  const rig = creerRig(ap, ap.palettes[variante % ap.palettes.length]);
  const anim = creerEtatAnimation(ap);
  const hauteur = px(c.perso.stats.hauteur);
  const largeur = px(c.perso.stats.largeur);

  const conteneur = new Container();
  const ombre = new Graphics().ellipse(0, 0, largeur * 0.62, 7).fill({ color: 0x000000, alpha: 0.4 });
  const anneau = new Graphics().ellipse(0, 0, largeur * 0.55, 6).stroke({ width: 3, color: couleur, alpha: 0.85 });
  const charge = new Graphics();
  const nom = new Text({
    text: etiquette,
    style: { fontFamily: POLICE, fontSize: 15, fontWeight: "800", fill: couleur, stroke: { color: 0x05070c, width: 4 } },
  });
  nom.anchor.set(0.5, 1);
  nom.y = -hauteur - 16;
  conteneur.addChild(ombre, anneau, rig.racine, charge, nom);

  const embleme = new Text({
    text: "",
    style: { fontFamily: POLICE_MATHS, fontSize: 380, fontWeight: "700", fill: 0xffd166 },
  });
  embleme.anchor.set(0.5);
  embleme.alpha = 0;
  ctx.arriere.addChild(embleme);

  let flash = 0;
  let temps = 0;
  let instance = -1;
  let touchesCoup = 0;
  const declenches = new Set<number>();
  let ondeFaite = false;

  return {
    conteneur,
    apparence: ap,

    flash() {
      flash = DUREE_FLASH;
    },

    touche(e) {
      const liste = ap.effets[e.cle]?.textesTouche;
      if (!liste || liste.length === 0) return;
      const texte = liste[Math.min(touchesCoup, liste.length - 1)];
      touchesCoup++;
      const final = touchesCoup === liste.length;
      ctx.textes.afficher(texte, px(e.x), px(e.y) - 36, {
        taille: final ? 64 : 40, couleur: final ? 0xffd166 : 0xffffff, math: true, duree: final ? 1100 : 700,
      });
    },

    contre(e) {
      const texte = ap.effets[e.cle]?.texteContre;
      if (texte) ctx.textes.afficher(texte, px(e.x), px(e.y) - 70, { taille: 46, couleur: 0xff4d5a, duree: 900 });
    },

    maj(c, monde, x, y, alpha, dtMs) {
      temps += dtMs;
      flash = Math.max(0, flash - dtMs);
      conteneur.visible = !c.horsJeu;
      // Gel d'impact : la cible tremble.
      const tremble = c.gel > 0 && c.hitstun > 0 ? (Math.random() - 0.5) * 6 : 0;
      conteneur.position.set(x + tremble, y);
      rig.racine.scale.x = c.orientation;
      rig.appliquer(animer(ap, c, monde, anim, x, alpha, dtMs));
      rig.flash(flash > 0);
      rig.eteindre(c.ko);
      rig.racine.alpha = c.invulnerable > 0 && !c.ko ? 0.55 + 0.3 * Math.sin(temps / 45) : 1;
      ombre.visible = c.auSol;
      anneau.visible = c.auSol && !c.ko;
      nom.visible = !c.ko;

      // Effets attachés au coup en cours, déclenchés une fois par exécution.
      const effet = c.coup !== null ? ap.effets[c.coup] : undefined;
      rig.accessoire(effet?.accessoire ?? null);
      if (c.coup !== null && c.instance !== instance) {
        instance = c.instance;
        declenches.clear();
        ondeFaite = false;
        touchesCoup = 0;
      }
      if (c.coup !== null && effet) {
        effet.textes?.forEach((t, i) => {
          if (c.frame < t.f || declenches.has(i)) return;
          declenches.add(i);
          const p = rig.point(t.membre, ctx.monde);
          ctx.textes.afficher(t.texte, p.x, p.y - 22, { taille: t.taille, couleur: t.couleur, math: t.math });
        });
        if (effet.onde !== undefined && c.frame >= effet.onde && !ondeFaite) {
          ondeFaite = true;
          ctx.effets.onde(x, y, 0xfff1d6, largeur * 2.4);
          ctx.effets.poussiere(x, y, 10, 0xf6f1e7);
          ctx.effets.secousse(6);
        }
        const [de, a] = fenetreActive(c);
        if (effet.trainee && dans(c.frame, de, a)) {
          for (const membre of effet.trainee) {
            const p = rig.point(membre, ctx.monde);
            ctx.trainees.ajouter(`${c.id}:${membre}`, p.x, p.y, effet.couleurTrainee ?? 0xffffff, membre === "torse" ? 16 : 9);
          }
        }
      }

      // Emblème d'ultime : immense, pâle, derrière tout le monde.
      const glyphe = effet?.embleme;
      if (glyphe) {
        embleme.text = glyphe;
        embleme.position.set(x, y - hauteur * 0.9);
        embleme.alpha = Math.min(0.16, embleme.alpha + dtMs / 1500);
        embleme.scale.set(0.9 + 0.1 * Math.sin(temps / 300));
      } else {
        embleme.alpha = Math.max(0, embleme.alpha - dtMs / 600);
      }

      // Charge : un anneau qui grossit au poing.
      charge.clear();
      const coup = coupDe(c);
      if (coup?.charge && c.frame === coup.charge.frame && c.charge > 0) {
        const t = c.charge / coup.charge.max;
        const p = rig.point("poingAv", conteneur);
        charge.circle(p.x, p.y, 10 + 22 * t + Math.sin(temps / 40) * 3)
          .stroke({ width: 3 + 3 * t, color: t >= 1 ? 0xffd166 : 0xffffff, alpha: 0.5 + 0.4 * t });
      }
    },

    detruire() {
      embleme.destroy();
      conteneur.removeChild(rig.racine);
      rig.detruire();
      conteneur.destroy({ children: true });
    },
  };
}
