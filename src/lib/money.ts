/*
 * Toute la monnaie est un entier de centimes. Aucun flottant n'est
 * jamais stocke ni transmis. Ce module ne fait que du formatage et de
 * l'analyse de saisie : il ne calcule aucun solde.
 */

export const CENTIMES_PAR_EURO = 100;

const nf = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234 -> "12,34 €" */
export function formatCentimes(centimes: number): string {
  const sign = centimes < 0 ? "−" : "";
  const abs = Math.abs(centimes);
  return `${sign}${nf.format(abs / CENTIMES_PAR_EURO)} €`;
}

/** 1234 -> "12,34" (sans symbole, pour les champs de saisie) */
export function formatMontantBrut(centimes: number): string {
  return nf.format(Math.abs(centimes) / CENTIMES_PAR_EURO);
}

/**
 * Analyse une saisie utilisateur ("12,34", "12.34", "12") en centimes.
 * Renvoie null si la saisie n'est pas un montant valide : l'appelant
 * decide du message. Jamais d'arrondi silencieux au-dela du centime.
 */
export function parseMontant(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const centimes = Math.round(Number(cleaned) * CENTIMES_PAR_EURO);
  if (!Number.isSafeInteger(centimes) || centimes <= 0) return null;
  return centimes;
}

/** Pourcentage affichable d'une part de cagnotte. */
export function formatPourcentage(part: number): string {
  return `${Math.round(part * 100)} %`;
}

/**
 * Cotes implicites parimutuelles : la part de la cagnotte misee sur
 * chaque issue. Cagnotte vide -> parts egales (aucune information).
 */
export function cotesImplicites(misesParIssue: number[]): number[] {
  const total = misesParIssue.reduce((a, b) => a + b, 0);
  if (total <= 0) return misesParIssue.map(() => 1 / (misesParIssue.length || 1));
  return misesParIssue.map((m) => m / total);
}

/**
 * ESTIMATION d'affichage seulement.
 *
 * Gain brut = mise x cagnotte / mises gagnantes, en supposant que la
 * mise est acceptee maintenant et que plus personne ne parie ensuite.
 * Le serveur recalcule tout au reglement ; cette valeur n'est jamais
 * ecrite en base et ne sert qu'a remplir l'apercu de la feuille de pari.
 */
export function estimerGain(
  miseCentimes: number,
  cagnotteActuelle: number,
  misesSurIssue: number,
): number {
  if (miseCentimes <= 0) return 0;
  const cagnotte = cagnotteActuelle + miseCentimes;
  const gagnantes = misesSurIssue + miseCentimes;
  if (gagnantes <= 0) return miseCentimes;
  return Math.floor((miseCentimes * cagnotte) / gagnantes);
}

/** Multiplicateur affiche ("x 2,40"). */
export function formatMultiplicateur(mise: number, gain: number): string {
  if (mise <= 0) return "—";
  return `× ${nf.format(gain / mise)}`;
}

/** "2 j 4 h", "3 h 12 min", "45 min", "Ferme" */
export function tempsRestant(closesAt: string | Date, maintenant = Date.now()): string {
  const ms = new Date(closesAt).getTime() - maintenant;
  if (ms <= 0) return "Fermé";
  const min = Math.floor(ms / 60_000);
  const h = Math.floor(min / 60);
  const j = Math.floor(h / 24);
  if (j >= 1) return `${j} j ${h % 24} h`;
  if (h >= 1) return `${h} h ${min % 60} min`;
  return `${min} min`;
}
