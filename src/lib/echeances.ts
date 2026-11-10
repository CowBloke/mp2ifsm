import "server-only";
import { z } from "zod";
import { query } from "./db";
import { ErreurMetier } from "./errors";
import { matiereDuFormulaire } from "./matieres";
import type { Utilisateur } from "./session";

/*
 * Écritures des échéances, partagées par les actions du site et l'API de
 * l'app. Elles lèvent des ErreurMetier ; l'appelant traduit.
 * Le type (DS, DM…) n'est plus demandé : les membres l'écrivent dans le titre.
 */
const Schema = z.object({
  titre: z.string().trim().min(3).max(120),
  matiere: z.string().optional(),
  dueAt: z.string().min(1),
  details: z.string().trim().max(500).optional(),
});

/** Champs bruts d'un formulaire ou d'un corps JSON (texte, ou absents). */
export type ChampsEcheance = { titre?: unknown; matiere?: unknown; dueAt?: unknown; details?: unknown };

function valider(champs: ChampsEcheance) {
  const texte = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
  const p = Schema.safeParse({
    titre: champs.titre, matiere: texte(champs.matiere),
    dueAt: champs.dueAt, details: texte(champs.details),
  });
  if (!p.success) throw new ErreurMetier("ECHEANCE_INVALIDE");
  const due = new Date(p.data.dueAt);
  if (Number.isNaN(due.getTime())) throw new ErreurMetier("DATE_INVALIDE");
  return { ...p.data, due };
}

export async function creerEcheance(u: Utilisateur, champs: ChampsEcheance): Promise<void> {
  const e = valider(champs);
  const matiere = await matiereDuFormulaire(e.matiere);
  await query(
    `insert into echeance (titre, subject_id, due_at, details, created_by)
     values ($1,$2,$3,$4,$5::uuid)`,
    [e.titre, matiere, e.due, e.details ?? null, u.id],
  );
}

/**
 * N'importe quel membre peut corriger une échéance de la classe (titre,
 * matière, date). Les colles viennent du colloscope et ne passent pas ici.
 */
export async function corrigerEcheance(id: number, champs: ChampsEcheance): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ErreurMetier("ECHEANCE_INTROUVABLE");
  const e = valider(champs);
  const [actuelle] = await query<{ subject_id: number | null }>(
    `select subject_id from echeance where id = $1 and deleted_at is null`, [id],
  );
  if (!actuelle) throw new ErreurMetier("ECHEANCE_INTROUVABLE");

  // Une matière archivée depuis reste acceptée si on n'y touche pas.
  const brut = String(e.matiere ?? "");
  const matiere = actuelle.subject_id !== null && brut === String(actuelle.subject_id)
    ? actuelle.subject_id
    : await matiereDuFormulaire(brut);

  const r = await query<{ id: number }>(
    `update echeance set titre = $2, subject_id = $3, due_at = $4
      where id = $1 and deleted_at is null
      returning id`,
    [id, e.titre, matiere, e.due],
  );
  if (r.length === 0) throw new ErreurMetier("ECHEANCE_INTROUVABLE");
}

/** L'auteur ou un administrateur peut retirer une échéance. */
export async function retirerEcheance(u: Utilisateur, id: number): Promise<void> {
  const r = await query<{ id: number }>(
    `update echeance set deleted_at = now()
      where id = $1 and deleted_at is null
        and ($3::boolean or created_by = $2::uuid)
      returning id`,
    [id, u.id, u.role === "admin"],
  );
  if (r.length === 0) throw new ErreurMetier("NON_AUTORISE");
}

export type EcheanceVue = {
  id: number;
  titre: string;
  subject_id: number | null;
  matiere: string | null;
  couleur: string | null;
  due_at: string;
  details: string | null;
  auteur: string;
  created_by: string;
};

export async function echeancesAVenir(limite = 20): Promise<EcheanceVue[]> {
  return query<EcheanceVue>(
    `select e.id, e.titre, e.subject_id, sj.nom as matiere, sj.couleur,
            e.due_at, e.details, u.display_name as auteur, e.created_by
       from echeance e join app_user u on u.id = e.created_by
       left join subject sj on sj.id = e.subject_id
      where e.deleted_at is null and e.due_at > now() - interval '12 hours'
      order by e.due_at asc
      limit $1`,
    [limite],
  );
}

/** « demain », « dans 3 jours », « aujourd'hui » */
export function quand(due: string | Date, maintenant = new Date()): string {
  const d = new Date(due);
  const jours = Math.round(
    (new Date(d.toDateString()).getTime() - new Date(maintenant.toDateString()).getTime())
    / 86_400_000,
  );
  if (jours < 0) return "en retard";
  if (jours === 0) return "aujourd’hui";
  if (jours === 1) return "demain";
  if (jours < 7) return `dans ${jours} jours`;
  if (jours < 14) return "dans une semaine";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}
