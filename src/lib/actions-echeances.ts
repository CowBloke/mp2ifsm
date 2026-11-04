"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerUtilisateur } from "./session";
import { matiereDuFormulaire } from "./matieres";
import type { Reponse } from "./actions";

/* Le type (DS, DM…) n'est plus demandé : les membres l'écrivent dans le titre. */
const Schema = z.object({
  titre: z.string().trim().min(3).max(120),
  matiere: z.string().optional(),
  dueAt: z.string().min(1),
  details: z.string().trim().max(500).optional(),
});

function lireFormulaire(formData: FormData) {
  const p = Schema.safeParse({
    titre: formData.get("titre"),
    matiere: formData.get("matiere") || undefined,
    dueAt: formData.get("dueAt"),
    details: formData.get("details") || undefined,
  });
  if (!p.success) return { ok: false, erreur: "Formulaire invalide" } as const;
  const due = new Date(p.data.dueAt);
  if (Number.isNaN(due.getTime())) return { ok: false, erreur: "Date invalide" } as const;
  return { ok: true, donnees: p.data, due } as const;
}

export async function ajouterEcheance(formData: FormData): Promise<Reponse<undefined>> {
  try {
    const u = await exigerUtilisateur();
    const f = lireFormulaire(formData);
    if (!f.ok) return { ok: false, erreur: f.erreur };

    const matiere = await matiereDuFormulaire(f.donnees.matiere);

    await query(
      `insert into echeance (titre, subject_id, due_at, details, created_by)
       values ($1,$2,$3,$4,$5::uuid)`,
      [f.donnees.titre, matiere, f.due, f.donnees.details ?? null, u.id],
    );

    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ErreurMetier)) console.error(err);
    return { ok: false, erreur: messageFr(err) };
  }
}

/**
 * N'importe quel membre peut corriger une échéance de la classe (titre,
 * matière, date). Les colles viennent du colloscope et ne passent pas ici.
 */
export async function modifierEcheance(id: number, formData: FormData): Promise<Reponse<undefined>> {
  try {
    await exigerUtilisateur();
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, erreur: "Échéance introuvable" };
    const f = lireFormulaire(formData);
    if (!f.ok) return { ok: false, erreur: f.erreur };

    const [actuelle] = await query<{ subject_id: number | null }>(
      `select subject_id from echeance where id = $1 and deleted_at is null`, [id],
    );
    if (!actuelle) return { ok: false, erreur: "Échéance introuvable" };

    // Une matière archivée depuis reste acceptée si on n'y touche pas.
    const brut = String(f.donnees.matiere ?? "");
    const matiere = actuelle.subject_id !== null && brut === String(actuelle.subject_id)
      ? actuelle.subject_id
      : await matiereDuFormulaire(brut);

    const r = await query<{ id: number }>(
      `update echeance set titre = $2, subject_id = $3, due_at = $4
        where id = $1 and deleted_at is null
        returning id`,
      [id, f.donnees.titre, matiere, f.due],
    );
    if (r.length === 0) return { ok: false, erreur: "Échéance introuvable" };

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
