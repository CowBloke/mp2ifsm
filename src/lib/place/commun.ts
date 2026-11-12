/*
 * La Toile — constantes et fonctions pures partagées par le serveur et
 * le navigateur (aucun import serveur ici).
 */

/** Côté de la toile, en pixels. Le schéma (place_log) borne x et y à 0..99. */
export const TAILLE = 100;

/** Palette maison. L'indice 0 est le fond : un pixel jamais posé est blanc. */
export const PALETTE = [
  "#ffffff", "#c9cdd2", "#7d838b", "#24262b",
  "#7a1f2b", "#e63946", "#f4a261", "#ffd23f",
  "#ffe8d6", "#8b5a2b", "#1d7a2f", "#57cc99",
  "#2a9d8f", "#4cc9f0", "#3a5bd9", "#1b1f5e",
  "#9b5de5", "#f15bb5",
] as const;

export const NOMS_COULEURS = [
  "Blanc", "Gris clair", "Gris", "Anthracite",
  "Bordeaux", "Rouge", "Orange", "Jaune",
  "Crème", "Brun", "Vert forêt", "Vert menthe",
  "Sarcelle", "Bleu ciel", "Bleu", "Marine",
  "Violet", "Rose",
] as const;

export const DELAI_DEFAUT_SECONDES = 300;

export const entierDans = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function pixelValide(x: unknown, y: unknown, couleur: unknown): boolean {
  return entierDans(x, 0, TAILLE - 1) && entierDans(y, 0, TAILLE - 1)
    && entierDans(couleur, 0, PALETTE.length - 1);
}

export type Zone = { x0: number; y0: number; x1: number; y1: number };

/** Rectangle normalisé (coins dans n'importe quel ordre), ou null s'il sort de la toile. */
export function normaliserZone(z: Partial<Record<keyof Zone, unknown>> | null | undefined): Zone | null {
  if (!z) return null;
  const { x0, y0, x1, y1 } = z;
  if (![x0, y0, x1, y1].every(v => entierDans(v, 0, TAILLE - 1))) return null;
  const [a, b, c, d] = [x0, y0, x1, y1] as number[];
  return { x0: Math.min(a, c), y0: Math.min(b, d), x1: Math.max(a, c), y1: Math.max(b, d) };
}

/** Toile complète en base64 (un octet par pixel, ligne par ligne). */
export function encoderToile(octets: Uint8Array): string {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) {
    s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function decoderToile(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(TAILLE * TAILLE);
  for (let i = 0; i < out.length && i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** « 4:05 » pour un délai restant en millisecondes. */
export function formatAttente(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Réponse de GET /api/toile. */
export type EtatToile = {
  v: number;
  maintenant: number;
  delai: number;
  gelee: boolean;
  /** Fin de l'attente du membre courant (ms epoch), 0 s'il peut poser. */
  prochain: number;
  banni: boolean;
  /** Toile entière (première lecture, ou trop de retard). */
  plein?: string;
  /** Sinon les changements depuis la version connue : x, y, couleur à la suite. */
  changements?: number[];
};

export type InfoPixel = {
  x: number; y: number; couleur: number;
  auteur: { id: string | null; nom: string | null } | null;
  nature: "pixel" | "admin" | null;
  le: string | null;
};

export type Contributeur = {
  id: string; nom: string; banni: boolean;
  dernier: string | null; heure: number; total: number;
};
