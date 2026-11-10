"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, queryOne, tx } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { parseMontant } from "./money";
import { transfererKcPour, type ResultatTransfert } from "./profil";
import { parier, type ResultatPari } from "./paris";
import {
  creerSession, detruireSession, exigerAdmin, exigerUtilisateur,
  inscrireMembre, verifierIdentifiants,
} from "./session";

/*
 * Actions serveur. C'est la SEULE surface de mutation de l'application.
 *
 * Chaque action :
 *   1. verifie la session cote serveur (jamais de confiance au client) ;
 *   2. valide ses entrees ;
 *   3. appelle une fonction SQL dans une transaction ;
 *   4. renvoie l'etat autoritatif recalcule, pour que le client puisse
 *      confirmer son affichage optimiste au lieu de le deviner.
 */

export type Reponse<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; erreur: string };

function echec(err: unknown): { ok: false; erreur: string } {
  if (!(err instanceof ErreurMetier)) console.error(err);
  return { ok: false, erreur: messageFr(err) };
}


/* ------------------------------------------------------------------ */
/* Paris                                                               */
/* ------------------------------------------------------------------ */

export type { ResultatPari };

/** Place une mise (voir `parier`, src/lib/paris.ts). */
export async function placerPari(
  outcomeId: number,
  montantSaisi: string,
  cleIdempotence: string,
): Promise<Reponse<ResultatPari>> {
  try {
    const data = await parier(await exigerUtilisateur(), outcomeId, montantSaisi, cleIdempotence);
    revalidatePath("/");
    revalidatePath("/marche");
    revalidatePath("/profil");
    revalidatePath("/marche/classement");
    if (data.slug) revalidatePath(`/marche/${data.slug}`);
    const { slug: _, ...resultat } = data;
    return { ok: true, data: resultat };
  } catch (err) {
    return echec(err);
  }
}

/* ------------------------------------------------------------------ */
/* Portefeuille                                                        */
/* ------------------------------------------------------------------ */

export type { ResultatTransfert };

/** Dépôt ou retrait kcmaths (voir `transfererKcPour`, src/lib/profil.ts). */
export async function transfererKc(
  sens: "depot" | "retrait",
  montantSaisi: string,
  cleIdempotence: string,
): Promise<Reponse<ResultatTransfert>> {
  try {
    const data = await transfererKcPour(await exigerUtilisateur(), sens, montantSaisi, cleIdempotence);
    revalidatePath("/profil");
    revalidatePath("/marche/classement");
    return { ok: true, data };
  } catch (err) {
    return echec(err);
  }
}

/* ------------------------------------------------------------------ */
/* Administration                                                      */
/* ------------------------------------------------------------------ */

const SchemaMarche = z.object({
  question: z.string().trim().min(8, "Question trop courte").max(200),
  description: z.string().trim().max(1000).optional(),
  closesAt: z.string().min(1),
  issues: z.array(z.string().trim().min(1).max(60)).min(2).max(10),
});

export async function creerMarche(formData: FormData): Promise<Reponse<{ slug: string }>> {
  try {
    const admin = await exigerAdmin();

    const parsed = SchemaMarche.safeParse({
      question: formData.get("question"),
      description: formData.get("description") || undefined,
      closesAt: formData.get("closesAt"),
      issues: formData.getAll("issue").map(String).filter((s) => s.trim() !== ""),
    });
    if (!parsed.success) {
      return { ok: false, erreur: parsed.error.issues[0]?.message ?? "Formulaire invalide" };
    }
    const { question, description, closesAt, issues } = parsed.data;

    const closes = new Date(closesAt);
    if (Number.isNaN(closes.getTime()) || closes.getTime() <= Date.now()) {
      return { ok: false, erreur: "La date de fermeture doit être dans le futur" };
    }
    if (new Set(issues.map((i) => i.toLowerCase())).size !== issues.length) {
      return { ok: false, erreur: "Deux issues portent le même nom" };
    }

    const base =
      question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "marche";

    const slug = await tx(async (c) => {
      // Le marche et ses issues sont crees ensemble : la contrainte
      // differee "au moins 2 issues" est verifiee au COMMIT.
      let candidat = base;
      for (let n = 2; ; n++) {
        const pris = await c.query(`select 1 from market where slug = $1`, [candidat]);
        if (pris.rowCount === 0) break;
        candidat = `${base.slice(0, 44)}-${n}`;
      }

      const m = await c.query<{ id: number }>(
        `insert into market (slug, question, description, closes_at, created_by)
         values ($1, $2, $3, $4, $5::uuid) returning id`,
        [candidat, question, description ?? null, closes.toISOString(), admin.id],
      );

      for (const [i, label] of issues.entries()) {
        await c.query(
          `insert into outcome (market_id, label, position) values ($1, $2, $3)`,
          [m.rows[0].id, label, i],
        );
      }
      return candidat;
    });

    revalidatePath("/");
    revalidatePath("/marche");
    revalidatePath("/admin");
    return { ok: true, data: { slug } };
  } catch (err) {
    return echec(err);
  }
}

export async function resoudreMarche(
  marketId: number,
  outcomeId: number,
): Promise<Reponse<{ cagnotte: number }>> {
  try {
    const admin = await exigerAdmin();

    const cagnotte = await tx(async (c) => {
      const r = await c.query<{ settle_market: number }>(
        `select settle_market($1::bigint, $2::bigint, $3::uuid) as settle_market`,
        [marketId, outcomeId, admin.id],
      );
      return r.rows[0].settle_market;
    });

    revalidatePath("/");
    revalidatePath("/marche");
    revalidatePath("/admin");
    revalidatePath("/profil");
    revalidatePath("/marche/classement");
    return { ok: true, data: { cagnotte } };
  } catch (err) {
    return echec(err);
  }
}

export async function annulerMarche(marketId: number): Promise<Reponse<{ rembourse: number }>> {
  try {
    const admin = await exigerAdmin();
    const rembourse = await tx(async (c) => {
      const r = await c.query<{ cancel_market: number }>(
        `select cancel_market($1::bigint, $2::uuid) as cancel_market`,
        [marketId, admin.id],
      );
      return r.rows[0].cancel_market;
    });

    revalidatePath("/");
    revalidatePath("/marche");
    revalidatePath("/admin");
    revalidatePath("/profil");
    return { ok: true, data: { rembourse } };
  } catch (err) {
    return echec(err);
  }
}

/** Credite un membre a la main (depot hors API, ex. especes). */
export async function crediterManuellement(
  userId: string,
  montantSaisi: string,
  reference: string,
): Promise<Reponse<undefined>> {
  try {
    await exigerAdmin();
    const centimes = parseMontant(montantSaisi);
    if (centimes === null) throw new ErreurMetier("MONTANT_INVALIDE");
    const ref = reference.trim() || `manuel-${randomUUID()}`;

    await tx(async (c) => {
      await c.query(`select record_deposit($1::uuid, $2::bigint, $3::text)`, [
        userId, centimes, `manuel:${ref}`,
      ]);
    });

    revalidatePath("/admin");
    revalidatePath("/marche/classement");
    return { ok: true };
  } catch (err) {
    return echec(err);
  }
}

/* ------------------------------------------------------------------ */
/* Comptes                                                             */
/* ------------------------------------------------------------------ */

export async function connexion(
  _precedent: Reponse<undefined> | null,
  formData: FormData,
): Promise<Reponse<undefined>> {
  try {
    const userId = await verifierIdentifiants(
      String(formData.get("email") ?? "").trim(),
      String(formData.get("motDePasse") ?? ""),
    );
    await creerSession(userId);
  } catch (err) {
    return echec(err);
  }
  redirect("/");
}

export async function inscription(
  _precedent: Reponse<undefined> | null,
  formData: FormData,
): Promise<Reponse<undefined>> {
  try {
    const userId = await inscrireMembre({
      email: formData.get("email"), pseudo: formData.get("pseudo"),
      motDePasse: formData.get("motDePasse"), code: formData.get("code"),
    });
    await creerSession(userId);
  } catch (err) {
    return echec(err);
  }
  redirect("/");
}

export async function deconnexion(): Promise<void> {
  await detruireSession();
  redirect("/connexion");
}
