"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, queryOne, tx } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { parseMontant } from "./money";
import { soldeCentimes } from "./queries";
import {
  creerSession, detruireSession, exigerAdmin, exigerUtilisateur,
  hashMotDePasse, verifierMotDePasse,
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

const MISE_MINIMUM = 10; // 0,10 €

/* ------------------------------------------------------------------ */
/* Paris                                                               */
/* ------------------------------------------------------------------ */

export type ResultatPari = {
  betId: number;
  soldeCentimes: number;
  miseCentimes: number;
};

/**
 * Place une mise. Le montant arrive en texte brut depuis le formulaire
 * et n'est converti en centimes qu'ici, cote serveur.
 *
 * `cleIdempotence` est generee par le client au moment d'ouvrir la
 * feuille de pari : si la requete est rejouee (reseau instable, double
 * tap, rechargement), la contrainte UNIQUE fait que la seconde tentative
 * retrouve le pari existant au lieu d'en creer un second.
 */
export async function placerPari(
  outcomeId: number,
  montantSaisi: string,
  cleIdempotence: string,
): Promise<Reponse<ResultatPari>> {
  try {
    const u = await exigerUtilisateur();

    const cle = z.string().uuid().safeParse(cleIdempotence);
    if (!cle.success) throw new ErreurMetier("INVALID_TRANSFER");
    if (!Number.isSafeInteger(outcomeId) || outcomeId <= 0) {
      throw new ErreurMetier("OUTCOME_NOT_FOUND");
    }

    const centimes = parseMontant(montantSaisi);
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
      `select m.slug from bet b join market m on m.id = b.market_id where b.id = $1`,
      [betId],
    );

    revalidatePath("/");
    revalidatePath("/marche");
    revalidatePath("/profil");
    revalidatePath("/marche/classement");
    if (slug) revalidatePath(`/marche/${slug.slug}`);

    // Etat autoritatif : le client remplace son estimation par ceci.
    return {
      ok: true,
      data: { betId, soldeCentimes: await soldeCentimes(u.id), miseCentimes: centimes },
    };
  } catch (err) {
    return echec(err);
  }
}

/* ------------------------------------------------------------------ */
/* Portefeuille                                                        */
/* ------------------------------------------------------------------ */

export async function demanderRetrait(montantSaisi: string): Promise<Reponse<{ solde: number }>> {
  try {
    const u = await exigerUtilisateur();
    const centimes = parseMontant(montantSaisi);
    if (centimes === null) throw new ErreurMetier("MONTANT_INVALIDE");

    await tx(async (c) => {
      await c.query(`select request_withdrawal($1::uuid, $2::bigint, $3::text)`, [
        u.id, centimes, `withdraw:${u.id}:${randomUUID()}`,
      ]);
    });

    revalidatePath("/profil");
    revalidatePath("/marche/classement");
    return { ok: true, data: { solde: await soldeCentimes(u.id) } };
  } catch (err) {
    return echec(err);
  }
}

/** Declenche un tirage des depots chez le fournisseur externe. */
export async function synchroniserMesDepots(): Promise<Reponse<{ credites: number }>> {
  try {
    await exigerUtilisateur();
    const { synchroniserDepots } = await import("./external");
    const r = await synchroniserDepots();
    revalidatePath("/profil");
    revalidatePath("/marche/classement");
    return { ok: true, data: { credites: r.credites } };
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
    const email = String(formData.get("email") ?? "").trim();
    const motDePasse = String(formData.get("motDePasse") ?? "");
    if (!email || !motDePasse) throw new ErreurMetier("CHAMPS_MANQUANTS");

    const u = await queryOne<{ id: string; password_hash: string }>(
      `select id, password_hash from app_user where lower(email) = lower($1)`,
      [email],
    );

    // Meme cout et meme message que l'email existe ou non : on ne
    // revele pas quels emails sont inscrits.
    const ok = u
      ? await verifierMotDePasse(motDePasse, u.password_hash)
      : await verifierMotDePasse(motDePasse, await hashMotDePasse(randomUUID()));

    if (!u || !ok) throw new ErreurMetier("IDENTIFIANTS_INVALIDES");

    await creerSession(u.id);
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
    const email = String(formData.get("email") ?? "").trim();
    const pseudo = String(formData.get("pseudo") ?? "").trim();
    const motDePasse = String(formData.get("motDePasse") ?? "");
    const code = String(formData.get("code") ?? "").trim();

    if (!email || !pseudo || !motDePasse || !code) throw new ErreurMetier("CHAMPS_MANQUANTS");
    if (motDePasse.length < 8) throw new ErreurMetier("MOT_DE_PASSE_COURT");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErreurMetier("EMAIL_INVALIDE");

    const hash = await hashMotDePasse(motDePasse);

    const userId = await tx(async (c) => {
      // Le verrou sur le code d'invitation serialise les inscriptions
      // concurrentes : max_uses ne peut pas etre depasse.
      const inv = await c.query<{ code: string; uses: number; max_uses: number }>(
        `select code, uses, max_uses from invite_code where code = $1 for update`,
        [code],
      );
      if (inv.rowCount === 0 || inv.rows[0].uses >= inv.rows[0].max_uses) {
        throw new ErreurMetier("CODE_INVITATION_INVALIDE");
      }

      const existant = await c.query(
        `select 1 from app_user where lower(email) = lower($1)`, [email]);
      if (existant.rowCount) throw new ErreurMetier("EMAIL_DEJA_UTILISE");

      const pseudoPris = await c.query(
        `select 1 from app_user where lower(display_name) = lower($1)`, [pseudo]);
      if (pseudoPris.rowCount) throw new ErreurMetier("PSEUDO_DEJA_UTILISE");

      const u = await c.query<{ id: string }>(
        `insert into app_user (email, display_name, password_hash)
         values ($1, $2, $3) returning id`,
        [email, pseudo, hash],
      );
      await c.query(`update invite_code set uses = uses + 1 where code = $1`, [code]);
      return u.rows[0].id;
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
