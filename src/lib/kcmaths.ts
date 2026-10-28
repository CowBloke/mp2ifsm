import "server-only";
import { query, queryOne, tx } from "./db";
import { ErreurMetier } from "./errors";
import { CENTIEMES_PAR_KC } from "./money";

/*
 * Transferts de KC coins avec kcmaths.com.
 *
 * kcmaths expose un seul point d'entree (api/mp2ifsm.php) qui ajoute
 * `delta` KC coins au compte `email` : negatif pour un depot vers
 * mp2ifsm, positif pour un retour. Il dedoublonne sur `ref` et refuse
 * un debit qui rendrait le solde negatif (409).
 *
 * `montant` est toujours un nombre entier de KC coins ; le grand livre
 * compte en centiemes de pricoupenkoin (1 KC = 1 PCK = CENTIEMES_PAR_KC).
 *
 * Ordre des ecritures, pour qu'aucune panne ne cree de KC coins :
 *   depot   : appel kcmaths, PUIS credit du grand livre ;
 *   retrait : debit du grand livre, PUIS appel kcmaths (remboursement
 *             si kcmaths refuse definitivement).
 * Un appel sans reponse laisse le transfert en_attente ; le cron le
 * rejoue avec la meme ref jusqu'a obtenir une reponse definitive.
 */

export type Sens = "depot" | "retrait";
export type Statut = "en_attente" | "effectue" | "refuse";

/** Resultat d'un appel. `refuse` est definitif ; `injoignable` se rejoue. */
export type ReponseKcmaths =
  | { statut: "ok" }
  | { statut: "refuse"; motif: string }
  | { statut: "injoignable"; detail: string };

type Config = { url: string; token: string };

function config(): Config | null {
  const url = process.env.KCMATHS_API_URL;
  const token = process.env.KCMATHS_API_TOKEN;
  return url && token ? { url, token } : null;
}

/*
 * Tant que kcmaths n'a pas installe son point d'entree (pas de jeton) ou
 * que la migration db/schema-kcmaths.sql n'est pas passee, le portefeuille
 * reste lisible : pas de transfert, aucune erreur. La presence de la
 * table n'est memorisee qu'une fois constatee.
 */
let tableVue = false;
async function tableExiste(): Promise<boolean> {
  if (!tableVue) {
    const r = await queryOne<{ ok: boolean }>(`select to_regclass('kcmaths_transfer') is not null as ok`);
    tableVue = r?.ok ?? false;
  }
  return tableVue;
}

export async function kcmathsDisponible(): Promise<boolean> {
  return config() !== null && (await tableExiste());
}

/** Codes renvoyes par kcmaths qui ne changeront pas en reessayant. */
const REFUS_DEFINITIFS: Record<number, string> = {
  400: "KCMATHS_REQUETE_INVALIDE",
  404: "COMPTE_KC_INTROUVABLE",
  409: "SOLDE_KC_INSUFFISANT",
};

export async function appelerKcmaths(
  cfg: Config,
  ref: string,
  email: string,
  delta: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ReponseKcmaths> {
  let res: Response;
  try {
    res = await fetchImpl(cfg.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${cfg.token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ ref, email, delta }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { statut: "injoignable", detail: String(err) };
  }

  const motif = REFUS_DEFINITIFS[res.status];
  if (motif) return { statut: "refuse", motif };
  // 401/403 (jeton), 5xx, redirections : probleme de configuration ou
  // panne passagere, jamais imputable a l'eleve. On rejouera.
  if (!res.ok) return { statut: "injoignable", detail: `HTTP ${res.status}` };

  const corps = (await res.json().catch(() => null)) as { ok?: unknown } | null;
  if (corps?.ok !== true) return { statut: "injoignable", detail: "reponse inattendue" };
  return { statut: "ok" };
}

/**
 * Enregistre la demande (et, pour un retrait, debite le grand livre)
 * dans une transaction. `ref` vient du client : un double envoi
 * retrouve la meme ligne au lieu d'en creer une seconde.
 */
export async function demarrerTransfert(
  userId: string,
  email: string,
  sens: Sens,
  montant: number,
  ref: string,
): Promise<void> {
  if (!(await kcmathsDisponible())) throw new ErreurMetier("KCMATHS_NON_CONFIGURE");

  await tx(async (c) => {
    if (sens === "retrait") {
      await c.query(`select request_withdrawal($1::uuid, $2::bigint, $3::text)`, [
        userId, montant * CENTIEMES_PAR_KC, `withdraw:kcmaths:${ref}`,
      ]);
    }
    await c.query(
      `insert into kcmaths_transfer (ref, user_id, email, sens, montant)
       values ($1::uuid, $2::uuid, $3, $4, $5)
       on conflict (ref) do nothing`,
      [ref, userId, email, sens, montant],
    );
    const ligne = await c.query<{ user_id: string; sens: string; montant: number }>(
      `select user_id, sens, montant from kcmaths_transfer where ref = $1::uuid`,
      [ref],
    );
    const l = ligne.rows[0];
    if (!l || l.user_id !== userId || l.sens !== sens || l.montant !== montant) {
      throw new ErreurMetier("INVALID_TRANSFER");
    }
  });
}

/**
 * Fait avancer un transfert en_attente d'un appel. La ligne reste
 * verrouillee pendant l'appel : deux traitements simultanes (clic et
 * cron) ne peuvent pas l'appliquer deux fois.
 */
export async function traiterTransfert(
  ref: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ statut: Statut; motif: string | null }> {
  const cfg = config();
  if (cfg) {
    await tx(async (c) => {
      const r = await c.query<{ user_id: string; email: string; sens: Sens; montant: number }>(
        `select user_id, email, sens, montant from kcmaths_transfer
          where ref = $1::uuid and statut = 'en_attente'
          for update skip locked`,
        [ref],
      );
      const t = r.rows[0];
      if (!t) return;

      const delta = t.sens === "depot" ? -t.montant : t.montant;
      const reponse = await appelerKcmaths(cfg, ref, t.email, delta, fetchImpl);

      if (reponse.statut === "injoignable") {
        console.error(`kcmaths ${ref} injoignable: ${reponse.detail}`);
        await c.query(
          `update kcmaths_transfer set tentatives = tentatives + 1, maj_le = now()
            where ref = $1::uuid`,
          [ref],
        );
        return;
      }

      if (reponse.statut === "ok" && t.sens === "depot") {
        await c.query(`select record_deposit($1::uuid, $2::bigint, $3::text)`, [
          t.user_id, t.montant * CENTIEMES_PAR_KC, `kcmaths:${ref}`,
        ]);
      }
      if (reponse.statut === "refuse" && t.sens === "retrait") {
        // Les KC coins ont deja quitte le portefeuille : on les rend.
        await c.query(`select record_deposit($1::uuid, $2::bigint, $3::text)`, [
          t.user_id, t.montant * CENTIEMES_PAR_KC, `kcmaths-remboursement:${ref}`,
        ]);
      }
      await c.query(
        `update kcmaths_transfer
            set statut = $2, motif = $3, tentatives = tentatives + 1, maj_le = now()
          where ref = $1::uuid`,
        [ref, reponse.statut === "ok" ? "effectue" : "refuse",
         reponse.statut === "refuse" ? reponse.motif : null],
      );
    });
  }

  const fin = await queryOne<{ statut: Statut; motif: string | null }>(
    `select statut, motif from kcmaths_transfer where ref = $1::uuid`,
    [ref],
  );
  if (!fin) throw new ErreurMetier("INVALID_TRANSFER");
  return fin;
}

/** Rejoue les transferts restes en_attente (appele par le cron). */
export async function reprendreTransferts(): Promise<{ vus: number; termines: number }> {
  if (!(await kcmathsDisponible())) return { vus: 0, termines: 0 };
  const lignes = await query<{ ref: string }>(
    `select ref from kcmaths_transfer
      where statut = 'en_attente' and maj_le < now() - interval '1 minute'
      order by cree_le limit 100`,
  );
  let termines = 0;
  for (const { ref } of lignes) {
    const r = await traiterTransfert(ref);
    if (r.statut !== "en_attente") termines += 1;
  }
  return { vus: lignes.length, termines };
}

export type TransfertVue = { sens: Sens; montant: number; cree_le: string };

export async function transfertsEnAttente(userId: string): Promise<TransfertVue[]> {
  if (!(await tableExiste())) return [];
  return query<TransfertVue>(
    `select sens, montant, cree_le from kcmaths_transfer
      where user_id = $1::uuid and statut = 'en_attente'
      order by cree_le desc`,
    [userId],
  );
}
