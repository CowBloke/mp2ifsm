import { z } from "zod";

/*
 * Montage des vidéos éducatives, partagé entre l'éditeur (navigateur)
 * et le rendu ffmpeg (serveur). L'éditeur ne modifie jamais les clips :
 * il produit cette description, l'aperçu l'imite en CSS et le serveur
 * l'applique pour de bon. Les filtres sont donc définis une seule fois,
 * comme des fonctions CSS dont on dérive les matrices ffmpeg exactes.
 */

export const DUREE_MAX_S = 180;
export const CLIPS_MAX = 20;
export const TEXTES_MAX = 10;
// Somme des clips bruts envoyés : sous la limite de 100 Mo par requête de Cloudflare.
export const TAILLE_MAX_VIDEO = 90 * 1024 * 1024;
export const CLIP_MIN_S = 0.3;

type Fonction = ["sepia" | "grayscale" | "saturate" | "brightness" | "contrast" | "hue-rotate" | "invert", number];

/*
 * Filtres façon Snap : on les fait défiler sur la caméra et chacun
 * s'applique au clip filmé. `vignette` assombrit les bords (cos⁴, comme
 * le filtre vignette de ffmpeg). Les anciennes clés restent valables.
 */
export const FILTRES: Record<string, { libelle: string; fonctions: Fonction[]; vignette?: boolean }> = {
  aucun: { libelle: "Normal", fonctions: [] },
  vif: { libelle: "Vif", fonctions: [["saturate", 1.45], ["contrast", 1.08]] },
  chaud: { libelle: "Chaud", fonctions: [["sepia", 0.3], ["saturate", 1.25]] },
  lumineux: { libelle: "Lumineux", fonctions: [["brightness", 1.15], ["contrast", 1.05]] },
  vintage: { libelle: "Vintage", fonctions: [["sepia", 0.45], ["contrast", 0.92], ["brightness", 1.06], ["saturate", 0.9]], vignette: true },
  cine: { libelle: "Ciné", fonctions: [["contrast", 1.25], ["saturate", 0.8], ["brightness", 0.95]], vignette: true },
  pop: { libelle: "Pop", fonctions: [["saturate", 1.9], ["contrast", 1.15], ["hue-rotate", -8]] },
  reve: { libelle: "Rêve", fonctions: [["brightness", 1.1], ["saturate", 1.35], ["contrast", 0.9], ["hue-rotate", -15]] },
  nuit: { libelle: "Bleu nuit", fonctions: [["grayscale", 1], ["sepia", 1], ["hue-rotate", 180], ["saturate", 1.6], ["brightness", 0.95]] },
  matrix: { libelle: "Matrix", fonctions: [["grayscale", 1], ["sepia", 1], ["hue-rotate", 65], ["saturate", 2], ["contrast", 1.1]] },
  nb: { libelle: "N&B", fonctions: [["grayscale", 1], ["contrast", 1.1]] },
  tableau: { libelle: "Tableau", fonctions: [["grayscale", 1], ["contrast", 1.6], ["brightness", 1.1]] },
  negatif: { libelle: "Négatif", fonctions: [["invert", 1]] },
};
export type CleFiltre = keyof typeof FILTRES;

export const TAILLES_TEXTE = { s: 0.045, m: 0.062, l: 0.085 } as const;
export const POSITIONS_TEXTE = ["haut", "milieu", "bas"] as const;

const seconde = z.number().finite().min(0).max(3600);
const cleFiltre = z.string().refine((f) => Object.hasOwn(FILTRES, f));

/*
 * Bibliothèque de musiques, toutes synthétisées par
 * scripts/generer-musiques.ts (aucun droit d'auteur tiers). Boucles
 * sans couture : le rendu les répète si la vidéo est plus longue.
 */
export const MUSIQUES: Record<string, { titre: string; ambiance: string; duree: number }> = {
  lofi: { titre: "Lo-fi révision", ambiance: "Calme · concentration", duree: 49.23 },
  piano: { titre: "Piano calme", ambiance: "Doux · explication", duree: 53.33 },
  synthwave: { titre: "Synthwave nuit", ambiance: "Rétro · motivant", duree: 38.4 },
  chiptune: { titre: "Chiptune bonus", ambiance: "8 bits · fun", duree: 27.43 },
  energie: { titre: "Énergie", ambiance: "House · dynamique", duree: 30.97 },
};
export const TAILLE_MAX_MUSIQUE = 15 * 1024 * 1024;

export const schemaMontage = z.object({
  clips: z.array(z.object({
    source: z.number().int().min(0).max(CLIPS_MAX - 1),
    debut: seconde,
    fin: seconde,
    muet: z.boolean(),
    // Filtre choisi à la caméra (ou dans l'éditeur) pour ce clip.
    filtre: cleFiltre.default("aucun"),
  }).refine((c) => c.fin - c.debut >= CLIP_MIN_S, "clip trop court")).min(1).max(CLIPS_MAX),
  // Filtre global des montages d'avant les filtres par clip ; « aucun » désormais.
  filtre: cleFiltre,
  textes: z.array(z.object({
    texte: z.string().trim().min(1).max(120),
    debut: seconde,
    fin: seconde,
    position: z.enum(POSITIONS_TEXTE),
    taille: z.enum(["s", "m", "l"]),
    fond: z.boolean(),
  }).refine((t) => t.fin > t.debut, "texte sans durée")).max(TEXTES_MAX),
  couverture: seconde,
  musique: z.object({
    // Clé de la bibliothèque (public/musique) ou « perso » : fichier envoyé avec les clips.
    cle: z.string().refine((c) => c === "perso" || Object.hasOwn(MUSIQUES, c)),
    titre: z.string().trim().min(1).max(80),
    // Point de départ dans le morceau, en secondes.
    debut: seconde,
    volume: z.number().min(0).max(1),
    // Volume des voix des clips sous la musique.
    voix: z.number().min(0).max(1),
    // Index du fichier « perso » dans les sources : fixé par le serveur.
    source: z.number().int().min(0).max(CLIPS_MAX).optional(),
  }).nullable().default(null),
});
export type Montage = z.infer<typeof schemaMontage>;
export type MusiqueMontage = NonNullable<Montage["musique"]>;
export type ClipMontage = Montage["clips"][number];
export type TexteMontage = Montage["textes"][number];

export function dureeTotale(m: Pick<Montage, "clips">): number {
  return m.clips.reduce((s, c) => s + (c.fin - c.debut), 0);
}

/**
 * Valide un montage reçu du client, `nbSources` clips envoyés.
 * `musiquePerso` : index de la source du fichier de musique envoyé, s'il y en a un.
 */
export function lireMontage(brut: unknown, nbSources: number, musiquePerso?: number): Montage | null {
  const r = schemaMontage.safeParse(brut);
  if (!r.success) return null;
  const m = r.data;
  if (m.musique) {
    if (m.musique.cle === "perso") {
      if (musiquePerso === undefined) return null;
      m.musique.source = musiquePerso;
    } else delete m.musique.source;
  }
  if (m.clips.some((c) => c.source >= nbSources)) return null;
  const total = dureeTotale(m);
  if (total > DUREE_MAX_S + 1) return null;
  // Textes et couverture ramenés dans la durée réelle.
  m.textes = m.textes
    .map((t) => ({ ...t, debut: Math.min(t.debut, total), fin: Math.min(t.fin, total) }))
    .filter((t) => t.fin - t.debut > 0.05);
  m.couverture = Math.min(m.couverture, Math.max(0, total - 0.1));
  return m;
}

/* --- Filtres ------------------------------------------------------- */

export function filtreCss(cle: string): string {
  const f = FILTRES[cle];
  if (!f || f.fonctions.length === 0) return "none";
  return f.fonctions.map(([n, v]) => (n === "hue-rotate" ? `${n}(${v}deg)` : `${n}(${v})`)).join(" ");
}

/*
 * Vignette de l'aperçu : un dégradé noir posé par-dessus, d'opacité
 * 1 − cos⁴(π/5 · r), r étant la distance au centre rapportée à la
 * demi-diagonale ; exactement ce que fait `vignette` (défaut) de ffmpeg.
 */
export function vignetteCss(cle: string): string | undefined {
  if (!FILTRES[cle]?.vignette) return undefined;
  const arrets = Array.from({ length: 11 }, (_, k) => {
    const r = k / 10;
    const a = 1 - Math.cos((Math.PI / 5) * r) ** 4;
    return `rgb(0 0 0 / ${a.toFixed(3)}) ${k * 10}%`;
  });
  return `radial-gradient(circle farthest-corner at center, ${arrets.join(", ")})`;
}

type Matrice = [number, number, number, number, number, number, number, number, number];

/* Matrices de la spécification CSS Filter Effects. */
function matrice([nom, a]: Fonction): Matrice | null {
  switch (nom) {
    case "grayscale": {
      const b = 1 - a;
      return [0.2126 + 0.7874 * b, 0.7152 - 0.7152 * b, 0.0722 - 0.0722 * b,
              0.2126 - 0.2126 * b, 0.7152 + 0.2848 * b, 0.0722 - 0.0722 * b,
              0.2126 - 0.2126 * b, 0.7152 - 0.7152 * b, 0.0722 + 0.9278 * b];
    }
    case "sepia": {
      const b = 1 - a;
      return [0.393 + 0.607 * b, 0.769 - 0.769 * b, 0.189 - 0.189 * b,
              0.349 - 0.349 * b, 0.686 + 0.314 * b, 0.168 - 0.168 * b,
              0.272 - 0.272 * b, 0.534 - 0.534 * b, 0.131 + 0.869 * b];
    }
    case "saturate":
      return [0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a,
              0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a,
              0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a];
    case "brightness":
      return [a, 0, 0, 0, a, 0, 0, 0, a];
    case "hue-rotate": {
      const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      return [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
              0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
              0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
    }
    default:
      return null;
  }
}

const n4 = (x: number) => Number(x.toFixed(4)).toString();

/** Chaîne de filtres ffmpeg équivalente (en RGB), vide pour « aucun ». */
export function filtreFfmpeg(cle: string): string[] {
  const f = FILTRES[cle];
  if (!f) return [];
  const chaine = f.fonctions.map((fn) => {
    if (fn[0] === "contrast" || fn[0] === "invert") {
      // CSS : contrast (x − 0,5)·c + 0,5 ; invert x·(1 − 2a) + a : une droite par canal.
      const [pente, origine] = fn[0] === "contrast" ? [fn[1], 0.5 - 0.5 * fn[1]] : [1 - 2 * fn[1], fn[1]];
      const e = `clip(val*${n4(pente)}+${n4(origine * 255)}\\,0\\,255)`;
      return `lutrgb=r=${e}:g=${e}:b=${e}`;
    }
    const m = matrice(fn)!;
    const [rr, rg, rb, gr, gg, gb, br, bg, bb] = m.map(n4);
    return `colorchannelmixer=rr=${rr}:rg=${rg}:rb=${rb}:gr=${gr}:gg=${gg}:gb=${gb}:br=${br}:bg=${bg}:bb=${bb}`;
  });
  if (f.vignette) chaine.push("format=rgb24", "vignette");
  return chaine;
}

/* --- Textes -------------------------------------------------------- */

/**
 * Coupe un texte en lignes pour une image de largeur `largeur` et de
 * petit côté `cote`. Même calcul dans l'aperçu et dans ffmpeg (qui ne
 * sait pas couper les lignes lui-même).
 */
export function couperTexte(texte: string, taille: keyof typeof TAILLES_TEXTE, largeur: number, cote: number): string[] {
  const police = cote * TAILLES_TEXTE[taille];
  const max = Math.max(6, Math.floor((largeur * 0.86) / (police * 0.66)));
  const lignes: string[] = [];
  for (const paragraphe of texte.split(/\r?\n/)) {
    let ligne = "";
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      let m = mot;
      while (m.length > max) {
        if (ligne) { lignes.push(ligne); ligne = ""; }
        lignes.push(m.slice(0, max));
        m = m.slice(max);
      }
      if (!ligne) ligne = m;
      else if (ligne.length + 1 + m.length <= max) ligne += ` ${m}`;
      else { lignes.push(ligne); ligne = m; }
    }
    if (ligne) lignes.push(ligne);
  }
  return lignes.slice(0, 6);
}

/** Position verticale du haut du bloc de texte, en fraction de la hauteur. */
export function hautDuBloc(position: TexteMontage["position"], hauteurBloc: number, hauteur: number): number {
  if (position === "haut") return hauteur * 0.1;
  if (position === "bas") return hauteur * 0.86 - hauteurBloc;
  return (hauteur - hauteurBloc) / 2;
}

export const INTERLIGNE = 1.32;

export function formatDuree(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
