/*
 * Curve Fight : l'arène, ses constantes et les réglages d'un salon.
 * Module pur, partagé par le serveur et le navigateur.
 */
import { TOUTES_FAMILLES, type Famille } from "./expression";

/** Repère : x de −25 à 25, y de −15 à 15. */
export const X_MAX = 25;
export const Y_MAX = 15;
export const RAYON_JOUEUR = 0.8;
export const RAYON_CRATERE = 1.3;
/** Longueur d'arc parcourue par tick ; toutes les courbes avancent du même pas. */
export const PAS = 0.12;
/** Unités d'arène par seconde à l'écran. */
export const VITESSE = 9;
export const LONGUEUR_MAX = 140;
/** Brouillard : disque dégagé autour de soi, couloir dégagé par ses courbes. */
export const VUE_DEPART = 4.5;
export const VUE_TRACE = 2.4;

export const JOUEURS_MAX = 10;
export const VOLEES_MAX = 8;

export type Cercle = { x: number; y: number; r: number };

export type Reglages = {
  mode: "classique" | "brouillard";
  tir: "fonction" | "equadiff";
  repereMuet: boolean;
  /** Aide facultative : tracé de sa propre courbe pendant la saisie. Coupée par défaut, le jeu se joue de tête. */
  apercu: boolean;
  familles: Famille[];
  /** Caractères au plus, 0 : libre. */
  longueurMax: number;
  /** Secondes de préparation, 0 : sans limite. */
  temps: number;
  manches: number;
  obstacles: "peu" | "normal" | "beaucoup";
  /** Disposition des obstacles ; « variee » en tire une à chaque manche. */
  carte: Carte;
};

export const CARTES = ["semis", "massifs", "murs", "pilier", "miroir"] as const;
export type StyleCarte = (typeof CARTES)[number];
export type Carte = "variee" | StyleCarte;
export const NOMS_CARTES: Record<Carte, string> = {
  variee: "Variée", semis: "Semis", massifs: "Massifs", murs: "Murs", pilier: "Pilier", miroir: "Miroir",
};

export const REGLAGES_DEFAUT: Reglages = {
  mode: "classique", tir: "fonction", repereMuet: false, apercu: false,
  familles: [...TOUTES_FAMILLES], longueurMax: 0, temps: 90, manches: 3, obstacles: "normal",
  carte: "variee",
};

export const CHOIX = {
  longueurMax: [0, 40, 25, 15],
  temps: [45, 90, 150, 0],
  manches: [1, 3, 5],
  obstacles: ["peu", "normal", "beaucoup"] as const,
  carte: ["variee", ...CARTES] as Carte[],
};

/** Applique un changement venu du navigateur ; tout ce qui est hors liste est ignoré. */
export function corrigerReglages(actuels: Reglages, brut: Record<string, unknown>): Reglages {
  const r = { ...actuels };
  if (brut.mode === "classique" || brut.mode === "brouillard") r.mode = brut.mode;
  if (brut.tir === "fonction" || brut.tir === "equadiff") r.tir = brut.tir;
  if (typeof brut.repereMuet === "boolean") r.repereMuet = brut.repereMuet;
  if (typeof brut.apercu === "boolean") r.apercu = brut.apercu;
  if (Array.isArray(brut.familles)) r.familles = TOUTES_FAMILLES.filter((f) => (brut.familles as unknown[]).includes(f));
  if (CHOIX.longueurMax.includes(brut.longueurMax as number)) r.longueurMax = brut.longueurMax as number;
  if (CHOIX.temps.includes(brut.temps as number)) r.temps = brut.temps as number;
  if (CHOIX.manches.includes(brut.manches as number)) r.manches = brut.manches as number;
  if (CHOIX.obstacles.includes(brut.obstacles as never)) r.obstacles = brut.obstacles as Reglages["obstacles"];
  if (CHOIX.carte.includes(brut.carte as Carte)) r.carte = brut.carte as Carte;
  return r;
}

/** Générateur déterministe (mulberry32) : une graine, une arène. */
export function aleatoire(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Arene = { positions: { x: number; y: number }[]; obstacles: Cercle[]; style: StyleCarte };

const DENSITE = { peu: 0.55, normal: 1, beaucoup: 1.55 };
/** Marge libre entre un obstacle et le disque d'un joueur. */
const DEGAGEMENT = 1.4;
type Point = { x: number; y: number };

/*
 * Une arène juste : plusieurs essais de placement, et l'on garde le plus
 * équitable. Les joueurs se répartissent sur une ellipse ou au hasard,
 * loin des bords ; à deux (et en style Miroir), tout est symétrique par
 * rapport à l'origine. Les obstacles suivent un style (semis, massifs,
 * murs, pilier central) ; on retient la disposition où chacun a à peu
 * près autant de place autour de lui et au moins une ligne de tir.
 */
export function genererArene(
  graine: number, n: number, densite: Reglages["obstacles"], carte: Carte = "semis",
): Arene {
  const rnd = aleatoire(graine);
  const style: StyleCarte = carte === "variee" ? CARTES[Math.floor(rnd() * CARTES.length)] : carte;
  const symetrie = n === 2 || style === "miroir";

  let positions: Point[] = [];
  let meilleur = -Infinity;
  for (let essai = 0; essai < 24; essai++) {
    const candidat = symetrie && n % 2 === 0 ? placerEnMiroir(rnd, n)
      : essai % 2 === 0 ? placerEnAnneau(rnd, n) : placerAuHasard(rnd, n);
    if (!candidat) continue;
    const note = noteEspacement(candidat);
    if (note > meilleur) { meilleur = note; positions = candidat; }
  }
  if (positions.length < n) positions = placerAuHasard(rnd, n, true)!;

  const voulu = DENSITE[densite];
  const miroir = symetrie && estSymetrique(positions);
  let obstacles: Cercle[] = [];
  meilleur = -Infinity;
  for (let essai = 0; essai < 10; essai++) {
    let brut = semer(style, rnd, voulu, miroir);
    if (miroir) brut = [...brut, ...brut.map((c) => ({ ...c, x: -c.x, y: -c.y }))];
    // Trop près d'un joueur, un obstacle rétrécit ; trop petit, il disparaît.
    const libres = brut.flatMap((c): Cercle[] => {
      const place = Math.min(...positions.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) - RAYON_JOUEUR - DEGAGEMENT - 0.02;
      const r = Math.floor(Math.min(c.r, place) * 100) / 100;
      return r >= 0.8 ? [{ x: arrondir(c.x), y: arrondir(c.y), r }] : [];
    }).filter((c) => positions.every((p) => Math.hypot(p.x - c.x, p.y - c.y) > c.r + RAYON_JOUEUR + DEGAGEMENT));
    const note = noteEquite(positions, libres);
    if (note > meilleur) { meilleur = note; obstacles = libres; }
    if (note >= 0.9) break;
  }
  return { positions, obstacles, style };
}

const marge = (p: Point) => Math.min(X_MAX - Math.abs(p.x), Y_MAX - Math.abs(p.y));

/** Proches voisins de même distance, et personne collé au bord. */
function noteEspacement(pts: Point[]): number {
  const voisins = pts.map((p) => Math.min(...pts.filter((q) => q !== p).map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
  const min = Math.min(...voisins), max = Math.max(...voisins);
  return min / max + min / 20 + Math.min(...pts.map(marge)) / 30;
}

function distincts(pts: Point[], ecart: number): boolean {
  return pts.every((p, i) => pts.slice(i + 1).every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= ecart)
    && Math.abs(p.x) <= X_MAX - 3 && Math.abs(p.y) <= Y_MAX - 3);
}

function placerEnAnneau(rnd: () => number, n: number): Point[] | null {
  const a = X_MAX - 4 - rnd() * 6, b = Y_MAX - 3.5 - rnd() * 4;
  const depart = rnd() * 2 * Math.PI, pas = (2 * Math.PI) / n;
  const pts = Array.from({ length: n }, (_, i) => {
    const t = depart + i * pas + (rnd() - 0.5) * pas * 0.3;
    const f = 0.85 + rnd() * 0.15;
    return { x: Math.round(a * f * Math.cos(t)), y: Math.round(b * f * Math.sin(t)) };
  });
  return distincts(pts, Math.min(9, 40 / Math.sqrt(n))) ? pts : null;
}

function placerEnMiroir(rnd: () => number, n: number): Point[] | null {
  const moitie: Point[] = [];
  for (let essai = 0; essai < 200 && moitie.length < n / 2; essai++) {
    const x = Math.round((rnd() * 2 - 1) * (X_MAX - 3)), y = Math.round((rnd() * 2 - 1) * (Y_MAX - 3));
    if (Math.hypot(x, y) < 6) continue;
    const essais = [...moitie, { x, y }];
    if (distincts([...essais, ...essais.map((p) => ({ x: -p.x, y: -p.y }))], Math.min(14, 44 / Math.sqrt(n)))) moitie.push({ x, y });
  }
  if (moitie.length < n / 2) return null;
  return moitie.flatMap((p) => [p, { x: -p.x, y: -p.y }]);
}

function placerAuHasard(rnd: () => number, n: number, force = false): Point[] | null {
  const pts: Point[] = [];
  let ecart = Math.min(22, 60 / Math.sqrt(n));
  while (pts.length < n) {
    let place = false;
    for (let essai = 0; essai < 200 && !place; essai++) {
      const x = Math.round((rnd() * 2 - 1) * (X_MAX - 3));
      const y = Math.round((rnd() * 2 - 1) * (Y_MAX - 3));
      if (pts.every((p) => Math.hypot(p.x - x, p.y - y) >= ecart)) { pts.push({ x, y }); place = true; }
    }
    if (!place) { if (!force) return null; ecart *= 0.85; }
  }
  return pts;
}

const estSymetrique = (pts: Point[]) => pts.every((p) => pts.some((q) => q.x === -p.x && q.y === -p.y));

/** Obstacles bruts d'un style ; en miroir, on n'en sème que la moitié (l'autre est le reflet). */
function semer(style: StyleCarte, rnd: () => number, densite: number, miroir: boolean): Cercle[] {
  const part = miroir ? 0.5 : 1;
  const hasard = (bord = 1) => ({ x: (rnd() * 2 - 1) * (X_MAX - bord), y: (rnd() * 2 - 1) * (Y_MAX - bord) });
  const semis = (nb: number, rMin: number, rMax: number) => Array.from({ length: Math.round(nb) }, () => ({
    ...hasard(), r: rMin + rnd() * rnd() * (rMax - rMin),
  }));
  const liste: Cercle[] = [];
  switch (style) {
    case "semis":
    case "miroir":
      return semis(11 * densite * part * (style === "miroir" ? 1.1 : 1), 1.2, 4.6);
    case "massifs": {
      for (let m = 0; m < Math.round((2 + 2 * densite) * part); m++) {
        const c = hasard(4);
        for (let i = 0; i < 3 + Math.floor(rnd() * 4); i++) {
          const a = rnd() * 2 * Math.PI, d = rnd() * 3.2;
          liste.push({ x: c.x + d * Math.cos(a), y: c.y + d * Math.sin(a), r: 1 + rnd() * 1.8 });
        }
      }
      return liste;
    }
    case "murs": {
      for (let m = 0; m < Math.round((2 + 2.2 * densite) * part); m++) {
        const c = hasard(3);
        const angle = rnd() < 0.6 ? Math.floor(rnd() * 4) * (Math.PI / 4) : rnd() * Math.PI;
        const longueur = 6 + rnd() * 10;
        const trou = rnd() < 0.5 ? rnd() * longueur : -1;
        for (let t = -longueur / 2; t <= longueur / 2; t += 1.05) {
          if (trou >= 0 && Math.abs(t + longueur / 2 - trou) < 1.6) continue;
          liste.push({ x: c.x + t * Math.cos(angle), y: c.y + t * Math.sin(angle), r: 0.85 });
        }
      }
      return liste.concat(semis(2 * densite * part, 1, 2));
    }
    case "pilier": {
      liste.push({ x: 0, y: 0, r: 3.5 + rnd() * 2.5 * Math.min(1.3, densite) });
      return liste.concat(semis(7 * densite * part, 1, 2.6));
    }
  }
}

/* --- Équité : de la place pour tout le monde -------------------------- */

const RAYONS = 24;
const PORTEE = 9;

function bloque(obstacles: Cercle[], x: number, y: number): boolean {
  return Math.abs(x) > X_MAX || Math.abs(y) > Y_MAX || dansCercles(obstacles, x, y);
}

/** Part du voisinage libre : distance au premier obstacle dans 24 directions. */
function ouverture(p: Point, obstacles: Cercle[]): number {
  let total = 0;
  for (let k = 0; k < RAYONS; k++) {
    const a = (k / RAYONS) * 2 * Math.PI;
    let d = 0.5;
    while (d < PORTEE && !bloque(obstacles, p.x + d * Math.cos(a), p.y + d * Math.sin(a))) d += 0.5;
    total += Math.min(d, PORTEE);
  }
  return total / (RAYONS * PORTEE);
}

function ligneLibre(p: Point, q: Point, obstacles: Cercle[]): boolean {
  const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.4);
  for (let i = 1; i < n; i++) {
    if (dansCercles(obstacles, p.x + ((q.x - p.x) * i) / n, p.y + ((q.y - p.y) * i) / n)) return false;
  }
  return true;
}

/** 1 : tout le monde aussi dégagé et chacun peut viser quelqu'un en ligne droite. */
export function noteEquite(positions: Point[], obstacles: Cercle[]): number {
  if (!obstacles.length) return 1;
  const ouv = positions.map((p) => ouverture(p, obstacles));
  const cibles = positions.map((p) => positions.filter((q) => q !== p && ligneLibre(p, q, obstacles)).length);
  const equilibre = Math.min(...ouv) / Math.max(...ouv);
  const tirs = cibles.every((c) => c > 0) ? 1 : 0.4;
  const ecartTirs = Math.min(...cibles) / Math.max(1, Math.max(...cibles));
  return equilibre * tirs * (0.8 + 0.2 * ecartTirs);
}

export const arrondir = (v: number) => Math.round(v * 100) / 100;
/** Points des courbes : au millième, pour rester sur le graphe quand on zoome. */
export const arrondirFin = (v: number) => Math.round(v * 1000) / 1000;

export function dansCercles(cercles: Cercle[], x: number, y: number): boolean {
  for (const c of cercles) {
    const dx = x - c.x, dy = y - c.y;
    if (dx * dx + dy * dy <= c.r * c.r) return true;
  }
  return false;
}

/** Matière pleine : dans un obstacle, hors de tout cratère. */
export function solide(obstacles: Cercle[], crateres: Cercle[], x: number, y: number): boolean {
  return dansCercles(obstacles, x, y) && !dansCercles(crateres, x, y);
}

/* --- Brouillard : grille de visibilité, tenue par le serveur ---------- */

const CASE = 0.25;
const COLONNES = Math.round((2 * X_MAX) / CASE);
const LIGNES = Math.round((2 * Y_MAX) / CASE);

export function nouveauVoile(): Uint8Array {
  return new Uint8Array(COLONNES * LIGNES);
}

export function devoiler(voile: Uint8Array, x: number, y: number, r: number): void {
  const c0 = Math.max(0, Math.floor((x - r + X_MAX) / CASE));
  const c1 = Math.min(COLONNES - 1, Math.floor((x + r + X_MAX) / CASE));
  const l0 = Math.max(0, Math.floor((y - r + Y_MAX) / CASE));
  const l1 = Math.min(LIGNES - 1, Math.floor((y + r + Y_MAX) / CASE));
  for (let l = l0; l <= l1; l++) {
    const cy = (l + 0.5) * CASE - Y_MAX;
    for (let c = c0; c <= c1; c++) {
      const cx = (c + 0.5) * CASE - X_MAX;
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r) voile[l * COLONNES + c] = 1;
    }
  }
}

export function visible(voile: Uint8Array, x: number, y: number): boolean {
  const c = Math.floor((x + X_MAX) / CASE), l = Math.floor((y + Y_MAX) / CASE);
  if (c < 0 || c >= COLONNES || l < 0 || l >= LIGNES) return false;
  return voile[l * COLONNES + c] === 1;
}

/** Un cercle se voit dès que son centre ou un point de son bord est dégagé. */
export function cercleVisible(voile: Uint8Array, c: Cercle): boolean {
  if (visible(voile, c.x, c.y)) return true;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * 2 * Math.PI;
    if (visible(voile, c.x + c.r * Math.cos(a), c.y + c.r * Math.sin(a))) return true;
  }
  return false;
}
