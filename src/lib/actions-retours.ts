"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "./db";
import { envoyerRetourPour } from "./profil";
import { ErreurMetier, messageFr } from "./errors";
import { exigerAdmin, exigerUtilisateur } from "./session";
import type { Reponse } from "./actions";

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}

export async function envoyerRetour(
  categorie: string, message: string, page?: string,
): Promise<Reponse<undefined>> {
  try {
    await envoyerRetourPour(await exigerUtilisateur(), categorie, message, page);
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
