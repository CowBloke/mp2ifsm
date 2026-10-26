import "server-only";
import type { PoolClient } from "pg";
import { ErreurMetier } from "./errors";
import type { KindDossier } from "./constantes";

/**
 * Lit le champ « dossier » d'un formulaire : "" = aucun dossier, sinon
 * l'id d'un dossier du bon type. Lève DOSSIER_INTROUVABLE pour le reste.
 */
export async function dossierDuFormulaire(
  valeur: unknown,
  kind: KindDossier,
  c: PoolClient,
): Promise<{ id: number; subject_id: number | null } | null> {
  const brut = String(valeur ?? "").trim();
  if (brut === "") return null;
  const id = Number(brut);
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErreurMetier("DOSSIER_INTROUVABLE");
  const r = await c.query<{ id: number; subject_id: number | null }>(
    `select id, subject_id from dossier where id = $1 and kind = $2`, [id, kind]);
  if (r.rows.length === 0) throw new ErreurMetier("DOSSIER_INTROUVABLE");
  return r.rows[0];
}
