import { ColorMatrixFilter, Container, Graphics, Point } from "pixi.js";
import type { Apparence, Membre, Palette, Pose } from "./types";

/*
 * Squelette d'un personnage : des pièces vectorielles dessinées une fois,
 * que l'on ne fait ensuite que placer et tourner (aucun redessin par image).
 *
 * Ordre d'affichage, du fond vers l'avant : bras arrière, jambe arrière,
 * jambe avant, buste (et tête), bras avant. Les épaules suivent le buste
 * par cinématique directe.
 */

const RAD = Math.PI / 180;
/** Membres arrière assombris : donne de la profondeur sans autre dessin. */
const TEINTE_ARRIERE = 0xa9aec0;

type Membre2 = { haut: Container; bas: Container; pieces: Graphics[] };

export type Rig = {
  /** Origine aux pieds ; `scale.x` = orientation. */
  racine: Container;
  appliquer(pose: Pose): void;
  /** Position d'un membre dans le repère de `repere`. */
  point(membre: Membre, repere: Container): { x: number; y: number };
  accessoire(nom: string | null): void;
  /** Éclair blanc de l'impact (filtre posé uniquement pendant l'éclair). */
  flash(actif: boolean): void;
  /** Assombrit tout le personnage (K.O.). */
  eteindre(actif: boolean): void;
  detruire(): void;
};

function multiplier(a: number, b: number): number {
  const r = (((a >> 16) & 255) * ((b >> 16) & 255)) / 255;
  const g = (((a >> 8) & 255) * ((b >> 8) & 255)) / 255;
  const bl = ((a & 255) * (b & 255)) / 255;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export function creerRig(ap: Apparence, palette: Palette): Rig {
  const P = ap.proportions;
  const D = ap.dessins;
  const racine = new Container();
  const corps = new Container();
  // Le corps tourne et s'étire autour de son centre, pas de ses pieds.
  const centre = P.hanche + P.torse / 2;
  corps.pivot.set(0, -centre);
  corps.position.set(0, -centre);
  racine.addChild(corps);

  const toutes: { g: Graphics; base: number }[] = [];
  function piece(dessin: (g: Graphics, p: Palette) => void, teinte = 0xffffff): Graphics {
    const g = new Graphics();
    dessin(g, palette);
    g.tint = teinte;
    toutes.push({ g, base: teinte });
    return g;
  }

  function membre(haut: (g: Graphics, p: Palette) => void, bas: (g: Graphics, p: Palette) => void,
    longueur: number, arriere: boolean): Membre2 {
    const teinte = arriere ? TEINTE_ARRIERE : 0xffffff;
    const h = new Container();
    const b = new Container();
    b.y = longueur;
    const g1 = piece(haut, teinte);
    const g2 = piece(bas, teinte);
    b.addChild(g2);
    h.addChild(g1, b);
    return { haut: h, bas: b, pieces: [g1, g2] };
  }

  const brasAr = membre(D.bras, D.avantBras, P.bras[0], true);
  const jambeAr = membre(D.cuisse, D.tibia, P.jambe[0], true);
  const jambeAv = membre(D.cuisse, D.tibia, P.jambe[0], false);
  const buste = new Container();
  buste.addChild(piece(D.buste));
  const tete = new Container();
  tete.y = -(P.torse + P.cou);
  tete.addChild(piece(D.tete));
  buste.addChild(tete);
  const brasAv = membre(D.bras, D.avantBras, P.bras[0], false);
  // Accessoire tenu dans la main avant.
  const main = new Container();
  main.y = P.bras[1];
  brasAv.bas.addChild(main);
  const accessoires = new Map<string, Graphics>();
  for (const [nom, dessin] of Object.entries(D.accessoires ?? {})) {
    const g = piece(dessin);
    g.visible = false;
    main.addChild(g);
    accessoires.set(nom, g);
  }
  corps.addChild(brasAr.haut, jambeAr.haut, jambeAv.haut, buste, brasAv.haut);

  const blanc = new ColorMatrixFilter();
  // Toute couleur devient blanche, l'opacité est conservée.
  blanc.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
  let eteint = false;

  function placerBras(m: Membre2, epaule: [number, number], angles: [number, number], hx: number, hy: number, a: number) {
    const [ex, ey] = epaule;
    m.haut.position.set(hx + ex * Math.cos(a) + ey * Math.sin(a), hy + ex * Math.sin(a) - ey * Math.cos(a));
    m.haut.rotation = a - angles[0] * RAD;
    m.bas.rotation = -angles[1] * RAD;
  }

  function placerJambe(m: Membre2, x: number, y: number, inclinaison: number, angles: [number, number]) {
    m.haut.position.set(x, y);
    m.haut.rotation = inclinaison - angles[0] * RAD;
    m.bas.rotation = -angles[1] * RAD;
  }

  const locaux: Record<Membre, () => [Container, number, number]> = {
    poingAv: () => [brasAv.bas, 0, P.bras[1] + 4],
    poingAr: () => [brasAr.bas, 0, P.bras[1] + 4],
    piedAv: () => [jambeAv.bas, P.pied * 0.4, P.jambe[1]],
    piedAr: () => [jambeAr.bas, P.pied * 0.4, P.jambe[1]],
    tete: () => [tete, 0, -P.rayonTete * 1.2],
    torse: () => [buste, 6, -P.torse * 0.55],
  };
  const tampon = new Point();

  return {
    racine,
    appliquer(pose) {
      const [bx, by, br] = pose.bassin;
      const hx = bx;
      const hy = -P.hanche + by;
      const inclinaison = br * RAD;
      const a = (pose.torse + br) * RAD;
      buste.position.set(hx, hy);
      buste.rotation = a;
      tete.rotation = pose.tete * RAD;
      placerBras(brasAv, P.epauleAv, pose.brasAv, hx, hy, a);
      placerBras(brasAr, P.epauleAr, pose.brasAr, hx, hy, a);
      placerJambe(jambeAv, hx + P.hancheAv, hy, inclinaison, pose.jambeAv);
      placerJambe(jambeAr, hx + P.hancheAr, hy, inclinaison, pose.jambeAr);
      corps.rotation = pose.rotation * RAD;
      corps.scale.set(pose.echelle[0], pose.echelle[1]);
      corps.position.set(pose.decalage[0], -centre + pose.decalage[1]);
    },
    point(membre, repere) {
      const [c, x, y] = locaux[membre]();
      tampon.set(x, y);
      const p = repere.toLocal(tampon, c);
      return { x: p.x, y: p.y };
    },
    accessoire(nom) {
      for (const [n, g] of accessoires) g.visible = n === nom;
    },
    flash(actif) {
      corps.filters = actif ? [blanc] : null;
    },
    eteindre(actif) {
      if (actif === eteint) return;
      eteint = actif;
      for (const { g, base } of toutes) g.tint = actif ? multiplier(base, 0x6d7285) : base;
    },
    detruire() {
      blanc.destroy();
      racine.destroy({ children: true });
    },
  };
}
