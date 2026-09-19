"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur } from "./session";
import { MATIERES } from "./constantes";
import type { Reponse } from "./actions";

const Schema = z.object({
  titre: z.string().trim().min(3).max(120),
  kind: z.enum(["DS", "DM", "Colle", "TIPE", "Oral", "Projet", "Autre"]),
  matiere: z.string().optional(),
  dueAt: z.string().min(1),
  details: z.string().trim().max(500).optional(),
});

export async function ajouterEcheance(formData: FormData): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const p = Schema.safeParse({
      titre: formData.get("titre"),
      kind: formData.get("kind"),
      matiere: formData.get("matiere") || undefined,
      dueAt: formData.get("dueAt"),
      details: formData.get("details") || undefined,
    });
    if (!p.success) return { ok: false, erreur: "Formulaire invalide" };

    const due = new Date(p.data.dueAt);
    if (Number.isNaN(due.getTime())) return { ok: false, erreur: "Date invalide" };

    const matiere = p.data.matiere && (MATIERES as readonly string[]).includes(p.data.matiere)
      ? p.data.matiere : null;

    await query(
      `insert into echeance (titre, kind, matiere, due_at, details, created_by)
       values ($1,$2::echeance_kind,$3::matiere,$4,$5,$6::uuid)`,
      [p.data.titre, p.data.kind, matiere, due, p.data.details ?? null, u.id],
    );

    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ErreurMetier)) console.error(err);
    return { ok: false, erreur: messageFr(err) };
  }
}

/** L'auteur ou un administrateur peut retirer une échéance. */
export async function supprimerEcheance(id: number): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const r = await query<{ id: number }>(
      `update echeance set deleted_at = now()
        where id = $1 and deleted_at is null
          and ($3::boolean or created_by = $2::uuid)
        returning id`,
      [id, u.id, u.role === "admin"],
    );
    if (r.length === 0) throw new ErreurMetier("NON_AUTORISE");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ErreurMetier)) console.error(err);
    return { ok: false, erreur: messageFr(err) };
  }
}
