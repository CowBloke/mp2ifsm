/*
 * Les fonctions SQL levent des codes stables (MARKET_CLOSED, ...).
 * Ce module est le seul endroit qui les traduit pour l'utilisateur.
 * Tout ce qui n'est pas reconnu devient un message generique : on ne
 * laisse jamais fuir un message PostgreSQL vers l'interface.
 */

export const MESSAGES_FR: Record<string, string> = {
  INSUFFICIENT_FUNDS: "Solde insuffisant",
  MARKET_CLOSED: "Marché fermé",
  MARKET_NOT_FOUND: "Marché introuvable",
  MARKET_ALREADY_RESOLVED: "Marché déjà résolu",
  OUTCOME_NOT_FOUND: "Issue introuvable",
  OUTCOME_NOT_IN_MARKET: "Cette issue n’appartient pas à ce marché",
  INVALID_AMOUNT: "Montant invalide",
  INVALID_TRANSFER: "Mouvement invalide",
  MONTANT_INVALIDE: "Montant invalide",
  MONTANT_MINIMUM: "Mise minimum : 0,10 €",
  NON_CONNECTE: "Session expirée, reconnectez-vous",
  NON_AUTORISE: "Accès refusé",
  IDENTIFIANTS_INVALIDES: "Email ou mot de passe incorrect",
  EMAIL_DEJA_UTILISE: "Cet email est déjà inscrit",
  PSEUDO_DEJA_UTILISE: "Ce pseudo est déjà pris",
  CODE_INVITATION_INVALIDE: "Code d’invitation invalide ou épuisé",
  MOT_DE_PASSE_COURT: "Mot de passe : 8 caractères minimum",
  CHAMPS_MANQUANTS: "Merci de remplir tous les champs",
  EMAIL_INVALIDE: "Adresse email invalide",
  REVISION_EXPIREE: "Cette carte a déjà été révisée ou la session a expiré. Rechargez la page.",
  NOTE_INVALIDE: "Note invalide",
  CARTE_INTROUVABLE: "Carte introuvable",
  CARTE_VIDE: "Le recto et le verso sont obligatoires",
  MOTIF_TROP_COURT: "Motif trop court",
  PAQUET_INTROUVABLE: "Paquet introuvable",
  DOCUMENT_INTROUVABLE: "Document introuvable",
  TYPE_NON_AUTORISE: "Type de fichier non autorisé",
  FICHIER_TROP_GROS: "Fichier trop volumineux",
  QUOTA_DEPASSE: "Quota de stockage dépassé",
  ESPACE_INSUFFISANT: "Espace disque insuffisant sur le serveur",
  FICHIER_MANQUANT: "Aucun fichier fourni",
  APKG_INVALIDE: "Fichier .apkg illisible",
  APKG_TROP_RECENT: "Export Anki trop récent — cochez « compatible avec les anciennes versions » dans Anki",
  APKG_VIDE: "Ce paquet Anki ne contient aucune carte",
  SETTLEMENT_NOT_CONSERVED: "Règlement incohérent, opération annulée",
  ESCROW_NOT_EMPTY: "Règlement incohérent, opération annulée",
  MATIERE_INVALIDE: "Matière inconnue ou archivée",
  MATIERE_EN_DOUBLE: "Une matière porte déjà ce nom",
  PAS_ABONNE: "Abonnez-vous à ce paquet pour le réviser",
  GROUPE_INVALIDE: "Numéro de groupe de colles invalide",
  RETOUR_INVALIDE: "Message trop court (5 caractères minimum)",
  RETOURS_TROP_NOMBREUX: "Trop de retours envoyés aujourd’hui, réessayez demain",
};

const MESSAGE_GENERIQUE = "Une erreur est survenue, réessayez";

/** Erreur applicative portant un code traduisible. */
export class ErreurMetier extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ErreurMetier";
  }
}

/**
 * Traduit n'importe quelle exception en message francais affichable.
 * Reconnait les codes levés par nos fonctions SQL, y compris quand
 * PostgreSQL les enrobe ("ERROR: INSUFFICIENT_FUNDS").
 */
export function messageFr(err: unknown): string {
  const brut =
    err instanceof ErreurMetier
      ? err.code
      : err instanceof Error
        ? err.message
        : String(err ?? "");

  for (const [code, message] of Object.entries(MESSAGES_FR)) {
    if (brut.includes(code)) return message;
  }

  // Violations de contrainte connues, au cas ou une insertion directe
  // passerait a cote d'une fonction SQL.
  if (brut.includes("append-only") || brut.includes("definitifs")) {
    return "Les paris sont définitifs";
  }
  if (brut.includes("duplicate key")) {
    return "Opération déjà enregistrée";
  }
  return MESSAGE_GENERIQUE;
}
