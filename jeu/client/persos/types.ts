import type { Graphics } from "pixi.js";

/*
 * Apparence d'un personnage : tout ce qui se voit, rien qui compte.
 *
 * Le gameplay vit dans jeu/noyau/contenu ; ici, un squelette dessiné en
 * vecteurs, des poses et des effets. Les animations des coups sont
 * calées sur leurs frames, donc sur les hitboxes réelles.
 *
 * Conventions (personnage tourné vers la droite, pixels, y vers le bas) :
 * les angles sont en degrés, positifs VERS L'AVANT. Bras et jambes
 * pendent à 0° ; 90° = à l'horizontale devant ; 180° = vers le haut.
 * Coude positif : l'avant-bras se replie vers l'avant. Genou négatif :
 * le tibia part vers l'arrière (pli naturel).
 */

export type Pose = {
  /** Bassin : décalage x, décalage y (vers le bas), inclinaison. */
  bassin: [number, number, number];
  /** Inclinaison du buste (positif = penché en avant). */
  torse: number;
  tete: number;
  /** [épaule, coude] */
  brasAv: [number, number];
  brasAr: [number, number];
  /** [hanche, genou] */
  jambeAv: [number, number];
  jambeAr: [number, number];
  /** Rotation du corps entier (saltos, vrilles), positif = vers l'avant. */
  rotation: number;
  /** Étirement [x, y] : écrasement et étirement des mouvements vifs. */
  echelle: [number, number];
  /** Décalage du corps entier, sans rotation (un K.O. repose au sol). */
  decalage: [number, number];
};

export type PosePartielle = Partial<Pose>;

/** Image clé : pose à la frame `f` d'un coup. */
export type Cle = { f: number; p: PosePartielle };

export type Membre = "poingAv" | "poingAr" | "piedAv" | "piedAr" | "tete" | "torse";

export type Palette = Readonly<Record<string, number>>;

export type Proportions = {
  /** Hauteur des hanches au repos. */
  hanche: number;
  /** Des hanches à la base du cou. */
  torse: number;
  cou: number;
  rayonTete: number;
  /** Épaules dans le repère du buste : [devant, au-dessus des hanches]. */
  epauleAv: [number, number];
  epauleAr: [number, number];
  /** Écart horizontal des articulations de hanche. */
  hancheAv: number;
  hancheAr: number;
  /** [bras, avant-bras] et [cuisse, tibia]. */
  bras: [number, number];
  jambe: [number, number];
  /** Longueur du pied vers l'avant. */
  pied: number;
};

/** Dessins des pièces, chacune dans son repère (membres : de l'articulation vers +y). */
export type Dessins = {
  buste(g: Graphics, p: Palette): void;
  tete(g: Graphics, p: Palette): void;
  bras(g: Graphics, p: Palette): void;
  avantBras(g: Graphics, p: Palette): void;
  cuisse(g: Graphics, p: Palette): void;
  tibia(g: Graphics, p: Palette): void;
  /** Objets tenus en main (ballon…), repère de la main. */
  accessoires?: Readonly<Record<string, (g: Graphics, p: Palette) => void>>;
};

export type TexteCoup = {
  /** Frame du coup à laquelle le texte apparaît. */
  f: number;
  texte: string;
  membre: Membre;
  taille?: number;
  couleur?: number;
  /** Police mathématique (KaTeX). */
  math?: boolean;
};

export type EffetCoup = {
  /** Membres qui laissent une traînée autour des frames actives. */
  trainee?: readonly Membre[];
  couleurTrainee?: number;
  textes?: readonly TexteCoup[];
  /** Textes montrés à chaque impact successif du coup (le dernier se répète). */
  textesTouche?: readonly string[];
  /** Texte montré quand le coup (un contre) intercepte une attaque. */
  texteContre?: string;
  /** Frame d'une onde de choc au sol. */
  onde?: number;
  /** Objet tenu pendant le coup. */
  accessoire?: string;
  /** Glyphe géant et discret derrière le personnage pendant le coup (ultimes). */
  embleme?: string;
};

export type NomPose = "garde" | "saut" | "chute" | "dash" | "touche" | "ko" | "atterrissage" | "victoire";

export type Apparence = {
  id: string;
  proportions: Proportions;
  /** Palettes : une par exemplaire du personnage dans la même partie. */
  palettes: readonly Palette[];
  dessins: Dessins;
  poses: Readonly<Record<NomPose, PosePartielle>>;
  animations: Readonly<Record<string, readonly Cle[]>>;
  effets: Readonly<Record<string, EffetCoup>>;
  /** Couleur des étincelles d'impact. */
  etincelles: number;
};
