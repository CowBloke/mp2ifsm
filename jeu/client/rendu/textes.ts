import { Container, Text } from "pixi.js";
import { POLICE } from "./couleurs";

/*
 * Textes flottants des coups (« oui », « Σ », « +∞ »…) : ils jaillissent,
 * montent un peu et s'effacent en moins d'une seconde. Toujours courts,
 * jamais en travers de l'écran. Les objets Text sont recyclés.
 */

/** Police mathématique du site (KaTeX, auto-hébergée), puis des secours. */
export const POLICE_MATHS = "KaTeX_Main, 'Latin Modern Math', 'Cambria Math', 'Times New Roman', serif";

type Vivant = { t: Text; vie: number; duree: number; taille: number };

export type OptionsTexte = { taille?: number; couleur?: number; math?: boolean; duree?: number };

export type Textes = {
  afficher(texte: string, x: number, y: number, options?: OptionsTexte): void;
  maj(dtMs: number): void;
};

export function creerTextes(couche: Container): Textes {
  const vivants: Vivant[] = [];
  const libres: Text[] = [];

  return {
    afficher(texte, x, y, { taille = 26, couleur = 0xffffff, math = false, duree = 720 } = {}) {
      if (vivants.length > 24) return;
      const t = libres.pop() ?? couche.addChild(new Text({ text: "", style: { fontFamily: POLICE } }));
      t.text = texte;
      t.style.fontFamily = math ? POLICE_MATHS : POLICE;
      t.style.fontSize = taille;
      t.style.fontWeight = math ? "700" : "900";
      t.style.fontStyle = math ? "normal" : "italic";
      t.style.fill = couleur;
      t.style.stroke = { color: 0x05070c, width: Math.max(4, taille / 6), join: "round" };
      t.anchor.set(0.5);
      t.position.set(x, y);
      t.visible = true;
      vivants.push({ t, vie: duree, duree, taille });
    },
    maj(dtMs) {
      for (let i = vivants.length - 1; i >= 0; i--) {
        const v = vivants[i];
        v.vie -= dtMs;
        if (v.vie <= 0) {
          v.t.visible = false;
          libres.push(v.t);
          vivants.splice(i, 1);
          continue;
        }
        const age = v.duree - v.vie;
        // Jaillit (grossit puis revient), monte, s'efface sur la fin.
        const pop = age < 90 ? 0.5 + (age / 90) * 0.7 : age < 180 ? 1.2 - ((age - 90) / 90) * 0.2 : 1;
        v.t.scale.set(pop);
        v.t.y -= dtMs * 0.035;
        v.t.alpha = Math.min(1, v.vie / (v.duree * 0.4));
      }
    },
  };
}
