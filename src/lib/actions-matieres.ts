"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query, tx } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerAdmin } from "./session";
import { CLES_PALETTE } from "./constantes";
import type { Reponse } from "./actions";

/*
 * Gestion des matières — administrateurs uniquement.
 *
 * On n'efface jamais une matière : l'archiver la retire des formulaires
 * de création tout en laissant l'historique (paquets, documents,
 * échéances) afficher son nom et sa couleur.
 */

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  if (err instanceof Error && err.message.includes("subject_nom_key")) {
    return { ok: false, erreur: messageFr(new ErreurMetier("MATIERE_EN_DOUBLE")) };
  }
  return { ok: false, erreur: messageFr(err) };
}

function rafraichir() {
  // Les couleurs apparaissent partout : toutes les rubriques sont à jour.
  revalidatePath("/", "layout");
}

const Schema = z.object({
  nom: z.string().trim().min(1).max(40),
  couleur: z.enum(CLES_PALETTE),
});

const Id = z.number().int().positive().max(32767);

export async function creerMatiere(nom: string, couleur: string): Promise<Reponse<{ id: number }>> {
  try {
    await exigerAdmin();
    const p = Schema.safeParse({ nom, couleur });
    if (!p.success) return { ok: false, erreur: "Nom (1 à 40 caractères) et couleur requis" };
    const [r] = await query<{ id: number }>(
      `insert into subject (nom, couleur, position)
       values ($1, $2, coalesce((select max(position) from subject), 0) + 10) returning id`,
      [p.data.nom, p.data.couleur],
    );
    rafraichir();
    return { ok: true, data: { id: r.id } };
  } catch (err) {
    return echec(err);
  }
}

export async function modifierMatiere(
  id: number, nom: string, couleur: string,
): Promise<Reponse<undefined>> {
  try {
    await exigerAdmin();
    const p = Schema.safeParse({ nom, couleur });
    if (!Id.safeParse(id).success || !p.success) {
      return { ok: false, erreur: "Nom (1 à 40 caractères) et couleur requis" };
    }
    const r = await query(`update subject set nom = $2, couleur = $3 where id = $1 returning id`,
      [id, p.data.nom, p.data.couleur]);
    if (r.length === 0) throw new ErreurMetier("MATIERE_INVALIDE");
    rafraichir();
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

export async function archiverMatiere(id: number, archiver: boolean): Promise<Reponse<undefined>> {
  try {
    await exigerAdmin();
    if (!Id.safeParse(id).success || typeof archiver !== "boolean") {
      throw new ErreurMetier("MATIERE_INVALIDE");
    }
    const r = await query(
      `update subject set archived_at = case when $2 then coalesce(archived_at, now()) end
        where id = $1 returning id`,
      [id, archiver],
    );
    if (r.length === 0) throw new ErreurMetier("MATIERE_INVALIDE");
    rafraichir();
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/** Échange la position avec la matière voisine (ordre d'affichage). */
export async function deplacerMatiere(id: number, sens: -1 | 1): Promise<Reponse<undefined>> {
  try {
    await exigerAdmin();
    if (!Id.safeParse(id).success || (sens !== -1 && sens !== 1)) {
      throw new ErreurMetier("MATIERE_INVALIDE");
    }
    await tx(async (c) => {
      await c.query(`lock table subject in share row exclusive mode`);
      const { rows } = await c.query<{ id: number }>(
        `select id from subject order by archived_at is not null, position, nom`);
      const i = rows.findIndex((r) => r.id === id);
      const j = i + sens;
      if (i < 0 || j < 0 || j >= rows.length) return;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      // Renumérote tout : aucune égalité de position ne subsiste.
      for (const [n, r] of rows.entries()) {
        await c.query(`update subject set position = $2 where id = $1`, [r.id, (n + 1) * 10]);
      }
    });
    rafraichir();
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}
