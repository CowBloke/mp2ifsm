/*
 * La monnaie du portail est le pricoupenkoin (PCK), divisible au
 * centieme. En base tout est un entier de centiemes de PCK (colonnes
 * `amount`, variables `centimes` historiques) : aucun flottant n'est
 * jamais stocke ni transmis. 1 KC coin de kcmaths.com = 1 PCK, et les
 * transferts avec kcmaths se font en KC coins entiers.
 * Ce module ne fait que du formatage et de l'analyse de saisie : il ne
 * calcule aucun solde.
 */

export const CENTIEMES_PAR_PCK = 100;
export const CENTIEMES_PAR_KC = CENTIEMES_PAR_PCK;

const nf = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1234 -> "12,34 PCK" */
export function formatCentimes(centimes: number): string {
  const sign = centimes < 0 ? "−" : "";
  const abs = Math.abs(centimes);
  return `${sign}${nf.format(abs / CENTIEMES_PAR_PCK)} PCK`;
}

/** 1234 -> "12,34" (sans symbole, pour les champs de saisie) */
export function formatMontantBrut(centimes: number): string {
  return nf.format(Math.abs(centimes) / CENTIEMES_PAR_PCK);
}

/**
 * Analyse une saisie utilisateur ("12,34", "12.34", "12") en centiemes
 * de PCK. Renvoie null si la saisie n'est pas un montant valide :
 * l'appelant decide du message. Jamais d'arrondi silencieux.
 */
export function parseMontant(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || !/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const centimes = Math.round(Number(cleaned) * CENTIEMES_PAR_PCK);
  if (!Number.isSafeInteger(centimes) || centimes <= 0) return null;
  return centimes;
}

/** Saisie d'un nombre entier de KC coins ("12", "1 234"), ou null. */
export function parseKc(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const kc = Number(cleaned);
  if (!Number.isSafeInteger(kc * CENTIEMES_PAR_KC) || kc <= 0) return null;
  return kc;
}

/** Nombre entier de KC coins qu'un solde permet de renvoyer sur kcmaths. */
export function kcRetirables(centimes: number): number {
  return Math.max(0, Math.floor(centimes / CENTIEMES_PAR_KC));
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
