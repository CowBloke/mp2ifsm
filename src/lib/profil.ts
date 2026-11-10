import "server-only";
import { z } from "zod";
import { query, queryOne, tx } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { kcRetirables, parseKc } from "./money";
import { proposalSchema, proposals, submitProposal } from "./proposals";
import { mouvements, positionsOuvertes, positionsReglees, soldeCentimes } from "./queries";
import { mesRetours } from "./retours";
import type { Utilisateur } from "./session";
import { GROUPE_MAX } from "./colloscope";

/*
 * Profil d'un membre : portefeuille (solde, transferts kcmaths, paris,
 * relevé), réglages, retours et propositions de paris. Partagé par les
 * actions du site et l'API de l'app ; tout lève des ErreurMetier.
 */

/** Tout ce qu'affiche `/profil` (hors administration), en une lecture. */
export async function lireProfil(u: Utilisateur) {
  const { kcmathsDisponible, transfertsEnAttente } = await import("./kcmaths");
  const [solde, enAttente, transferts, ouvertes, reglees, releve, reglages, retours, propositions] = await Promise.all([
    soldeCentimes(u.id),
    transfertsEnAttente(u.id),
    kcmathsDisponible(),
    positionsOuvertes(u.id),
    positionsReglees(u.id),
    mouvements(u.id, 30),
    queryOne<{ partage_stats: boolean }>(`select partage_stats from app_user where id = $1::uuid`, [u.id]),
    mesRetours(u.id),
    proposals(u.id),
  ]);
  return {
    portefeuille: { solde, kcRetirables: kcRetirables(solde), transferts, enAttente },
    positions: { ouvertes, reglees },
    releve,
    partageStats: reglages?.partage_stats ?? false,
    groupeMax: GROUPE_MAX,
    retours: retours.map(({ id, categorie, message, statut, reponse, created_at }) =>
      ({ id, categorie, message, statut, reponse, created_at })),
    propositions: propositions.map(({ id, question, closes_at, issues, status, review_note, slug }) =>
      ({ id, question, closes_at, issues, status, review_note, slug })),
  };
}

/** Partage des statistiques dans la heatmap de classe (opt-in, filtré en SQL). */
export async function partagerStatsPour(u: Utilisateur, actif: unknown): Promise<void> {
  if (typeof actif !== "boolean") throw new ErreurMetier("CHAMPS_MANQUANTS");
  await query(`update app_user set partage_stats = $2 where id = $1::uuid`, [u.id, actif]);
}

export type ResultatTransfert = {
  statut: "effectue" | "en_attente" | "refuse";
  motif: string | null;
  solde: number;
};

/**
 * Dépôt (KC coins de kcmaths convertis en pricoupenkoins) ou retrait
 * (pricoupenkoins renvoyés en KC coins entiers). `cle` est tirée par le
 * client à l'ouverture du formulaire et sert de ref chez kcmaths : un
 * double envoi ne transfère jamais deux fois.
 */
export async function transfererKcPour(
  u: Utilisateur, sens: unknown, montantSaisi: unknown, cle: unknown,
): Promise<ResultatTransfert> {
  const ref = z.string().uuid().safeParse(cle);
  if (!ref.success || (sens !== "depot" && sens !== "retrait")) throw new ErreurMetier("INVALID_TRANSFER");
  // Les transferts avec kcmaths se font en KC coins entiers.
  const montant = parseKc(String(montantSaisi ?? ""));
  if (montant === null) throw new ErreurMetier("MONTANT_KC_INVALIDE");
  const { demarrerTransfert, traiterTransfert } = await import("./kcmaths");
  await demarrerTransfert(u.id, u.email, sens, montant, ref.data);
  const r = await traiterTransfert(ref.data);
  return {
    statut: r.statut,
    motif: r.motif ? messageFr(new ErreurMetier(r.motif)) : null,
    solde: await soldeCentimes(u.id),
  };
}

const Retour = z.object({
  categorie: z.enum(["idee", "bug", "autre"]),
  message: z.string().trim().min(5).max(2000),
  page: z.string().max(300).optional(),
});
/** Plafond anti-abus : un membre n'inonde pas la file des admins. */
const RETOURS_PAR_JOUR = 20;

/** Idée, bug ou autre, lu par les administrateurs ; le membre suit le statut et la réponse. */
export async function envoyerRetourPour(u: Utilisateur, categorie: unknown, message: unknown, page?: unknown): Promise<void> {
  const p = Retour.safeParse({ categorie, message, page: page || undefined });
  if (!p.success) throw new ErreurMetier("RETOUR_INVALIDE");
  // Seul un chemin interne est conservé, jamais une URL arbitraire.
  const chemin = p.data.page?.startsWith("/") && !p.data.page.startsWith("//") ? p.data.page : null;
  await tx(async (c) => {
    await c.query(`select 1 from app_user where id = $1::uuid for update`, [u.id]);
    const { rows } = await c.query<{ n: number }>(
      `select count(*)::int as n from feedback
        where user_id = $1::uuid and created_at > now() - interval '1 day'`, [u.id]);
    if (rows[0].n >= RETOURS_PAR_JOUR) throw new ErreurMetier("RETOURS_TROP_NOMBREUX");
    await c.query(
      `insert into feedback (user_id, categorie, message, page) values ($1::uuid, $2, $3, $4)`,
      [u.id, p.data.categorie, p.data.message, chemin],
    );
  });
}

/** Propose une question à la classe ; un admin l'accepte (le marché est alors créé) ou la refuse. */
export async function proposerPariPour(u: Utilisateur, saisie: unknown): Promise<void> {
  const p = proposalSchema.safeParse(saisie);
  if (!p.success) {
    const champ = p.error.issues[0]?.path[0];
    throw new ErreurMetier(champ === "question" ? "PROPOSITION_QUESTION"
      : champ === "description" ? "PROPOSITION_DESCRIPTION"
      : champ === "closesAt" ? "PROPOSITION_DATE" : "PROPOSITION_ISSUES");
  }
  try {
    await submitProposal(u.id, p.data);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Vous avez")) throw new ErreurMetier("PROPOSITIONS_TROP_NOMBREUSES");
    throw err;
  }
}
