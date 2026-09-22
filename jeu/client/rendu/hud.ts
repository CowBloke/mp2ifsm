import { Container, Graphics, Text } from "pixi.js";
import { JAUGE_MAX } from "../../noyau/coups";
import { TICKS_PAR_SECONDE } from "../../noyau/constantes";
import type { Monde } from "../../noyau/monde";
import { DUREE_FIN_MANCHE } from "../../noyau/regles";
import { POLICE, couleurPlace } from "./couleurs";

/*
 * Interface en surimpression : cartouches des joueurs (PV, jauge
 * d'ultime, manches gagnées), chrono et annonces de manche. Tout est
 * déduit de l'état du monde à chaque image.
 */

type Cartouche = {
  fond: Graphics;
  nom: Text;
  perso: Text;
  pv: Text;
  /** PV affichés par la barre « traînante », qui rattrape les vrais PV. */
  traine: number;
  delai: number;
};

export type Hud = {
  maj(monde: Monde, noms: readonly string[], largeur: number, hauteur: number, dtMs: number): void;
};

function texte(taille: number, poids: "600" | "800" | "900", couleur = 0xffffff): Text {
  return new Text({
    text: "",
    style: {
      fontFamily: POLICE, fontSize: taille, fontWeight: poids, fill: couleur,
      stroke: { color: 0x05070c, width: Math.max(3, taille / 8) }, letterSpacing: taille > 40 ? 2 : 0,
    },
  });
}

/** Annonce du moment, déduite de la phase ; null s'il n'y a rien à dire. */
function annonce(m: Monde, noms: readonly string[]): { texte: string; depuis: number; couleur: number } | null {
  const t = m.phaseTicks;
  switch (m.phase) {
    case "decompte": {
      if (t < 60) return { texte: `MANCHE ${m.manche}`, depuis: t, couleur: 0xffffff };
      const reste = Math.ceil((m.reglages.dureeDecompte - t) / 30);
      return { texte: String(Math.max(1, reste)), depuis: (t - 60) % 30, couleur: 0xffd166 };
    }
    case "combat":
      return t < 50 ? { texte: "COMBAT !", depuis: t, couleur: 0xffd166 } : null;
    case "finManche":
      if (t < 80) {
        const chrono = m.reglages.dureeManche > 0 && m.chrono === 0;
        return { texte: chrono ? "TEMPS !" : "K.O. !", depuis: t, couleur: 0xff5a5f };
      }
      if (t < DUREE_FIN_MANCHE) {
        const v = m.vainqueurManche;
        return v >= 0
          ? { texte: `${noms[v]} remporte la manche`, depuis: t - 80, couleur: couleurPlace(v) }
          : { texte: "Manche nulle", depuis: t - 80, couleur: 0xffffff };
      }
      return null;
    case "finPartie":
      return m.vainqueur >= 0
        ? { texte: `VICTOIRE : ${noms[m.vainqueur]}`, depuis: t, couleur: couleurPlace(m.vainqueur) }
        : { texte: "ÉGALITÉ", depuis: t, couleur: 0xffffff };
  }
}

export function creerHud(couche: Container): Hud {
  const cartouches: Cartouche[] = [];
  const barres = new Graphics();
  const chrono = texte(34, "900");
  chrono.anchor.set(0.5, 0);
  const manche = texte(13, "800", 0xaab4d8);
  manche.anchor.set(0.5, 0);
  const grande = texte(54, "900");
  grande.anchor.set(0.5);
  couche.addChild(barres, chrono, manche, grande);

  return {
    maj(m, noms, largeur, hauteur, dtMs) {
      // Cartouches en bas de l'écran, centrés.
      while (cartouches.length < m.combattants.length) {
        const c: Cartouche = { fond: new Graphics(), nom: texte(16, "800"), perso: texte(11, "600", 0xaab4d8), pv: texte(22, "900"), traine: 0, delai: 0 };
        couche.addChildAt(c.fond, 0);
        couche.addChild(c.nom, c.perso, c.pv);
        cartouches.push(c);
      }
      const n = m.combattants.length;
      const l = Math.min(290, (largeur - 32 - (n - 1) * 12) / n);
      const h = 74;
      const x0 = (largeur - (n * l + (n - 1) * 12)) / 2;
      const y0 = hauteur - h - 14;
      barres.clear();

      m.combattants.forEach((c, i) => {
        const k = cartouches[i];
        const couleur = couleurPlace(i);
        const x = x0 + i * (l + 12);
        const pvMax = c.perso.stats.pv;
        // Barre traînante : attend un instant, puis rattrape les vrais PV.
        if (c.pv < k.traine) {
          k.delai -= dtMs;
          if (k.delai <= 0) k.traine = Math.max(c.pv, k.traine - pvMax * dtMs / 900);
        } else {
          k.traine = c.pv;
          k.delai = 350;
        }

        k.fond.clear()
          .roundRect(x, y0, l, h, 12).fill({ color: 0x0b0e17, alpha: 0.78 })
          .roundRect(x, y0, 6, h, 3).fill(couleur);
        k.nom.text = noms[i] ?? `J${i + 1}`;
        k.nom.style.fill = couleur;
        k.nom.position.set(x + 16, y0 + 8);
        k.perso.text = c.perso.nom;
        k.perso.position.set(x + 16, y0 + 27);
        k.pv.text = c.ko ? "K.O." : String(c.pv);
        k.pv.anchor.set(1, 0);
        k.pv.position.set(x + l - 12, y0 + 6);

        const bx = x + 16;
        const bl = l - 28;
        const by = y0 + 46;
        barres.roundRect(bx, by, bl, 10, 5).fill({ color: 0x2a3042 });
        barres.roundRect(bx, by, (bl * k.traine) / pvMax, 10, 5).fill({ color: 0xff5a5f });
        const part = c.pv / pvMax;
        const vie = part > 0.5 ? 0x3ddc84 : part > 0.25 ? 0xffc53d : 0xff7a45;
        if (c.pv > 0) barres.roundRect(bx, by, (bl * c.pv) / pvMax, 10, 5).fill({ color: vie });

        // Jauge d'ultime et manches gagnées.
        const pleine = c.jauge >= JAUGE_MAX;
        barres.roundRect(bx, by + 15, bl - 44, 5, 2.5).fill({ color: 0x2a3042 });
        barres.roundRect(bx, by + 15, ((bl - 44) * c.jauge) / JAUGE_MAX, 5, 2.5)
          .fill({ color: pleine ? 0xffd166 : 0x8f7cff, alpha: pleine ? 0.75 + 0.25 * Math.sin(performance.now() / 90) : 1 });
        for (let v = 0; v < m.reglages.manchesGagnantes; v++) {
          barres.circle(x + l - 16 - v * 14, by + 17, 5)
            .fill({ color: v < c.victoires ? couleur : 0x2a3042 })
            .stroke({ width: 1.5, color: couleur, alpha: 0.8 });
        }
      });

      // Chrono et numéro de manche.
      const chronometre = m.reglages.dureeManche > 0;
      chrono.visible = chronometre;
      chrono.text = String(Math.ceil(m.chrono / TICKS_PAR_SECONDE));
      chrono.style.fill = m.chrono < 10 * TICKS_PAR_SECONDE && m.phase === "combat" ? 0xff5a5f : 0xffffff;
      chrono.position.set(largeur / 2, 12);
      manche.text = `MANCHE ${m.manche}`;
      manche.position.set(largeur / 2, chronometre ? 52 : 14);

      // Annonce : apparaît en grossissant, puis se stabilise.
      const a = annonce(m, noms);
      grande.visible = a !== null;
      if (a) {
        grande.text = a.texte;
        grande.style.fill = a.couleur;
        const e = Math.min(1, a.depuis / 8);
        const echelle = Math.min(1, (largeur - 40) / Math.max(1, grande.width / grande.scale.x));
        grande.scale.set(echelle * (1.35 - 0.35 * e));
        grande.alpha = Math.min(1, a.depuis / 4 + 0.2);
        grande.position.set(largeur / 2, hauteur * 0.24);
      }
    },
  };
}
