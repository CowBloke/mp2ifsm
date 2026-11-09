/*
 * Statuts de Toilet! : un titre par palier de passages cumulés.
 * Module pur (ni base ni serveur) pour être partagé et testé.
 */

export type Statut = { seuil: number; titre: string; emoji: string; devise: string };

export const STATUTS: readonly Statut[] = [
  { seuil: 0, titre: "Vessie de pierre", emoji: "🪨", devise: "Rien ne sort, rien ne rentre." },
  { seuil: 1, titre: "Premier jet", emoji: "💧", devise: "Un petit pas pour l’homme, une grande chasse pour l’humanité." },
  { seuil: 3, titre: "Bleu du petit coin", emoji: "🧻", devise: "Encore en rodage, mais ça coule de source." },
  { seuil: 5, titre: "Apprenti plombier", emoji: "🔧", devise: "Il sait où se trouve le loquet." },
  { seuil: 10, titre: "Habitué du trône", emoji: "🪑", devise: "Assis, mais jamais à sa place en DS." },
  { seuil: 15, titre: "Chevalier de la chasse d’eau", emoji: "⚔️", devise: "Toujours prêt à tirer." },
  { seuil: 25, titre: "Baron de la balayette", emoji: "🧹", devise: "Propre sur lui, propre derrière lui." },
  { seuil: 35, titre: "Comte de la cuvette", emoji: "🚽", devise: "Il tient son rang, et sa lunette." },
  { seuil: 42, titre: "Réponse universelle", emoji: "🌌", devise: "La grande question : qui a fini le rouleau ?" },
  { seuil: 50, titre: "Seigneur des lunettes", emoji: "💍", devise: "Un trône pour les gouverner tous." },
  { seuil: 75, titre: "Duc du dérouleur", emoji: "🌀", devise: "Une série qui ne converge jamais." },
  { seuil: 100, titre: "Sa Majesté du petit coin", emoji: "👑", devise: "Le trône est à lui, la file d’attente aussi." },
  { seuil: 150, titre: "Empereur de la faïence", emoji: "🏛️", devise: "Il a bâti son empire sur des fondations solides." },
  { seuil: 250, titre: "Légende du tout-à-l’égout", emoji: "🐉", devise: "On raconte qu’il connaît chaque tuyau par son prénom." },
  { seuil: 500, titre: "Divinité de la chasse d’eau", emoji: "✨", devise: "Au commencement était le Flush." },
];

/** Statut atteint pour un total donné. */
export function statutPour(total: number): Statut {
  let s = STATUTS[0];
  for (const candidat of STATUTS) if (total >= candidat.seuil) s = candidat;
  return s;
}

/** Prochain palier, ou null au sommet. */
export function prochainStatut(total: number): (Statut & { restant: number }) | null {
  const s = STATUTS.find(c => c.seuil > total);
  return s ? { ...s, restant: s.seuil - total } : null;
}

export type Periode = "semaine" | "mois" | "total";
export const PERIODES: Record<Periode, string> = {
  semaine: "Cette semaine",
  mois: "Ce mois-ci",
  total: "Depuis toujours",
};

export function lirePeriode(v: unknown): Periode {
  return v === "semaine" || v === "mois" || v === "total" ? v : "semaine";
}

/** « 3 passages », « 1 passage », « aucun passage ». */
export function passages(n: number): string {
  return n === 0 ? "aucun passage" : `${n} passage${n > 1 ? "s" : ""}`;
}
