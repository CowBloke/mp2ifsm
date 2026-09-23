/*
 * Définitions de gameplay : ce qu'un personnage SAIT faire, en données.
 *
 * Le moteur interprète ces données de façon générique ; ajouter un
 * personnage ne demande aucune ligne dans la simulation. Toutes les
 * longueurs sont en unités (cf. constantes.ts), toutes les durées en
 * ticks (1/60 s), tous les multiplicateurs en millièmes (1000 = ×1).
 */

/** Emplacements de coups, choisis par le bouton et la direction tenue. */
export type Emplacement =
  | "neutre" | "cote" | "haut" | "bas"
  | "air_neutre" | "air_cote" | "air_haut" | "air_bas"
  | "special_neutre" | "special_cote" | "special_haut" | "special_bas"
  | "ultime";

export type StatsCombattant = {
  pv: number;
  /** Résistance au recul ; 100 = normal, plus lourd = moins projeté. */
  poids: number;
  largeur: number;
  hauteur: number;
  vitesseSol: number;
  accelerationSol: number;
  freinageSol: number;
  vitesseAir: number;
  accelerationAir: number;
  freinageAir: number;
  gravite: number;
  vitesseChuteMax: number;
  /** Chute rapide : bas pendant la descente. */
  vitesseChuteRapide: number;
  impulsionSaut: number;
  impulsionDoubleSaut: number;
  /** Sauts permis en l'air avant de retoucher le sol (1 = double saut). */
  sautsAeriens: number;
  dashVitesse: number;
  dashDuree: number;
  /** Attente entre la fin d'un dash et le suivant. */
  dashRecharge: number;
  /** Dashs permis en l'air avant de retoucher le sol. */
  dashsAeriens: number;
  /** Ticks d'invulnérabilité au début du dash (esquive). */
  dashInvulnerable: number;
};

/** Effet d'un coup reçu : commun aux hitboxes des coups et aux entités. */
export type ToucheDef = {
  degats: number;
  /** Recul : force de base, plus `croissance` × part des PV déjà perdus. */
  recul: number;
  croissance?: number;
  /** Angle du recul en degrés : 0 = vers l'avant, 90 = vers le haut, -90 = vers le bas. */
  angle: number;
  /**
   * Ticks pendant lesquels la cible ne peut plus agir. Un coup sans recul
   * ni hitstun est une « égratignure » : il blesse (et pose son statut)
   * sans interrompre la cible.
   */
  hitstun: number;
  /** Gel des deux combattants à l'impact (hitlag) ; calculé des dégâts sinon. */
  gel?: number;
  /** Statut infligé à la cible. */
  statut?: string;
  /** Clé d'effet visuel ; aucune incidence sur la simulation. */
  effet?: string;
};

export type HitboxDef = ToucheDef & {
  /** Frames actives, bornes incluses ; la frame 0 est le premier tick du coup. */
  de: number;
  a: number;
  /** Centre de la boîte : `x` devant le combattant, `y` au-dessus de ses pieds. */
  x: number;
  y: number;
  l: number;
  h: number;
  /** Les hitboxes d'un même groupe touchent une cible une seule fois par coup. */
  groupe?: number;
};

/**
 * Entité posée ou lancée par un coup : projectile, zone, piège, grappin…
 * Tout son comportement est ici ; le moteur ne connaît aucune entité par
 * son nom.
 */
export type EntiteDef = {
  /** Taille de sa boîte (centrée sur sa position). */
  l: number;
  h: number;
  duree: number;
  /** Vitesse de départ (vers l'avant du lanceur, vers le bas) et gravité. */
  vx?: number;
  vy?: number;
  gravite?: number;
  /** Au contact d'un bloc : traverser (défaut), s'arrêter, rebondir ou disparaître. */
  solides?: "traverser" | "arreter" | "rebondir" | "detruire";
  /** Rebonds permis avant de disparaître. */
  rebonds?: number;
  /** Ce qu'elle fait aux adversaires qu'elle touche. */
  touche?: ToucheDef & {
    /** Recul vers l'extérieur de l'entité (explosions) plutôt que dans son sens de marche. */
    radial?: boolean;
  };
  /** Touches avant de disparaître ; 0 ou absent : illimité (chaque cible une fois). */
  touchesMax?: number;
  /** Zone : les cibles présentes sont de nouveau touchées toutes les `periode` ticks. */
  periode?: number;
  /** Piège : inerte `armement` ticks, puis se déclenche (et disparaît) si un adversaire passe à moins de `rayon`. */
  declencheur?: { rayon: number; armement: number };
  /** Attire les adversaires à moins de `rayon`, de `force` unités par tick. */
  attraction?: { rayon: number; force: number };
  /** Grappin : accroché à un bloc, il tire son lanceur jusqu'à lui. */
  grappin?: { vitesse: number };
  /** Détruit les projectiles adverses qui le traversent. */
  bouclier?: boolean;
  /** Reste attachée à son lanceur. */
  suitLanceur?: boolean;
  /** Exemplaires simultanés par lanceur : au-delà, le plus ancien disparaît. */
  max?: number;
  /** Entité qui apparaît à sa place quand elle disparaît (explosion, flaque…). */
  surFin?: string;
  /** Fait partie d'un ultime : ne recharge pas la jauge. */
  ultime?: boolean;
};

/** Mouvement imposé pendant des frames : vx vers l'avant, vy vers le bas. */
export type MouvementDef = {
  de: number;
  a: number;
  vx?: number;
  vy?: number;
  /** Multiplicateur de gravité (‰) pendant ces frames. */
  gravite?: number;
};

export type CoupDef = {
  duree: number;
  hitboxes?: readonly HitboxDef[];
  mouvement?: readonly MouvementDef[];
  /** Part du contrôle aérien conservée pendant le coup (‰, défaut 500). */
  controleAir?: number;
  /** Coup aérien interrompu à l'atterrissage, suivi de ce nombre de ticks sans agir. */
  atterrissage?: number;
  /** À partir de cette frame, toute action peut interrompre le coup. */
  annulable?: number;
  /** Nouvel appui d'attaque pendant [de, a] : enchaîne sur `coup`. */
  suite?: { coup: string; de: number; a: number };
  /** Si le coup touche, enchaîne sur `coup` au tick suivant. */
  surTouche?: { coup: string };
  /** Frames de super-armure : les coups reçus blessent sans interrompre. */
  armure?: readonly [number, number];
  /** Frames d'invulnérabilité. */
  invulnerable?: readonly [number, number];
  /** Contre : touché pendant [de, a], on ne subit rien et on riposte. */
  contre?: { de: number; a: number; riposte: string };
  /** Charge : le bouton tenu fige la frame `frame` jusqu'à `max` ticks ; +`bonus` ‰ de dégâts à pleine charge. */
  charge?: { frame: number; max: number; bonus: number };
  /** Temps de recharge, compté depuis le début du coup. */
  recharge?: number;
  /** Coût en jauge d'ultime. */
  jauge?: number;
  /** Fait partie d'un ultime (suite d'un ultime) : ne recharge pas la jauge. */
  ultime?: boolean;
  /** Utilisable une seule fois par passage en l'air (coups de récupération). */
  unParSaut?: boolean;
  /** Statuts que le combattant s'applique à une frame donnée. */
  statutsSoi?: readonly { frame: number; statut: string }[];
  /** Entités lancées à une frame donnée, depuis (x devant, y au-dessus des pieds). */
  entites?: readonly { frame: number; id: string; x: number; y: number }[];
};

export type PersoDef = {
  id: string;
  nom: string;
  stats: StatsCombattant;
  /** Coups par identifiant ; les emplacements (« neutre », « air_bas »…) sont des identifiants. */
  coups: Readonly<Record<string, CoupDef>>;
  /** Entités que ses coups peuvent créer. */
  entites?: Readonly<Record<string, EntiteDef>>;
};
