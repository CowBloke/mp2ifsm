import "server-only";
import { z } from "zod";
import { queryOne, tx } from "./db";
import { ErreurMetier } from "./errors";
import { parseMontant } from "./money";
import { soldeCentimes } from "./queries";
import type { Utilisateur } from "./session";

/*
 * Mises du marché, partagées par l'action du site et l'API de l'app.
 * Tout l'argent passe par la fonction SQL place_bet (grand livre en
 * partie double, découvert impossible) ; ici on ne fait que valider la
 * saisie et la convertir en centimes.
 */

export const MISE_MINIMUM = 10; // 0,10 PCK

export type ResultatPari = {
  betId: number;
  soldeCentimes: number;
  miseCentimes: number;
};

/**
 * Place une mise. Le montant arrive en texte brut (« 1,50 ») et n'est
 * converti en centimes qu'ici, côté serveur.
 *
 * `cleIdempotence` est générée par le client à l'ouverture de la feuille
 * de pari : si la requête est rejouée (réseau instable, double tap), la
 * contrainte UNIQUE fait que la seconde tentative retrouve le pari
 * existant au lieu d'en créer un second.
 */
export async function parier(
  u: Utilisateur, outcomeId: number, montantSaisi: string, cleIdempotence: string,
): Promise<ResultatPari & { slug: string | null }> {
  const cle = z.string().uuid().safeParse(cleIdempotence);
  if (!cle.success) throw new ErreurMetier("INVALID_TRANSFER");
  if (!Number.isSafeInteger(outcomeId) || outcomeId <= 0) throw new ErreurMetier("OUTCOME_NOT_FOUND");

  const centimes = parseMontant(String(montantSaisi ?? ""));
  if (centimes === null) throw new ErreurMetier("MONTANT_INVALIDE");
  if (centimes < MISE_MINIMUM) throw new ErreurMetier("MONTANT_MINIMUM");

  const betId = await tx(async (c) => {
    const r = await c.query<{ place_bet: number }>(
      `select place_bet($1::uuid, $2::bigint, $3::bigint, $4::text) as place_bet`,
      [u.id, outcomeId, centimes, `bet:${u.id}:${cle.data}`],
    );
    return r.rows[0].place_bet;
  });
  const slug = await queryOne<{ slug: string }>(
    `select m.slug from bet b join market m on m.id = b.market_id where b.id = $1`, [betId]);

  // État autoritatif : le client remplace son estimation par ceci.
  return { betId, soldeCentimes: await soldeCentimes(u.id), miseCentimes: centimes, slug: slug?.slug ?? null };
}
