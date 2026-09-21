"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query, tx } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerAdmin, exigerUtilisateur } from "./session";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

const Envoi = z.object({
  categorie: z.enum(["idee", "bug", "autre"]),
  message: z.string().trim().min(5).max(2000),
  page: z.string().max(300).optional(),
});

/** Plafond anti-abus : un membre n'inonde pas la file des admins. */
const RETOURS_PAR_JOUR = 20;

export async function envoyerRetour(
  categorie: string, message: string, page?: string,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const p = Envoi.safeParse({ categorie, message, page: page || undefined });
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
    revalidatePath("/profil");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

const Traitement = z.object({
  id: z.number().int().positive(),
  statut: z.enum(["ouvert", "prevu", "refuse", "termine"]),
  reponse: z.string().trim().max(1000),
});

export async function traiterRetour(
  id: number, statut: string, reponse: string,
): Promise<Reponse<undefined>> {
  try {
    const u = await exigerAdmin();
    const p = Traitement.safeParse({ id, statut, reponse });
    if (!p.success) return { ok: false, erreur: "Demande invalide" };
    const r = await query(
      `update feedback set statut = $2, reponse = $3, traite_par = $4::uuid, updated_at = now()
        where id = $1 returning id`,
      [p.data.id, p.data.statut, p.data.reponse, u.id],
    );
    if (r.length === 0) return { ok: false, erreur: "Retour introuvable" };
    revalidatePath("/profil");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export async function archiverRetour(id: number, archiver: boolean): Promise<Reponse<undefined>> {
  try {
    await exigerAdmin();
    if (!Number.isSafeInteger(id) || id <= 0 || typeof archiver !== "boolean") {
      return { ok: false, erreur: "Demande invalide" };
    }
    await query(
      `update feedback set archived_at = case when $2 then coalesce(archived_at, now()) end,
              updated_at = now()
        where id = $1`,
      [id, archiver],
    );
    revalidatePath("/profil");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}
