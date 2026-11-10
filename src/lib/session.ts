import "server-only";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { query, queryOne, tx } from "./db";
import { ErreurMetier } from "./errors";

const scryptAsync = promisify(scrypt) as (
  motDePasse: string,
  sel: Buffer,
  longueur: number,
  options: { N: number },
) => Promise<Buffer>;

const COOKIE = "mp2_session";
const DUREE_JOURS = 30;

/* --- Mots de passe --------------------------------------------------
 * scrypt avec sel aleatoire par compte. Format stocke :
 * "scrypt$<N>$<sel hex>$<cle hex>". Aucune dependance native requise.
 */
const SCRYPT_N = 16384;
const KEYLEN = 64;

export async function hashMotDePasse(motDePasse: string): Promise<string> {
  const sel = randomBytes(16);
  const cle = (await scryptAsync(motDePasse, sel, KEYLEN, { N: SCRYPT_N }));
  return `scrypt$${SCRYPT_N}$${sel.toString("hex")}$${cle.toString("hex")}`;
}

export async function verifierMotDePasse(motDePasse: string, stocke: string): Promise<boolean> {
  const [algo, n, selHex, cleHex] = stocke.split("$");
  if (algo !== "scrypt") return false;
  const sel = Buffer.from(selHex, "hex");
  const attendu = Buffer.from(cleHex, "hex");
  const calcule = (await scryptAsync(motDePasse, sel, attendu.length, {
    N: Number(n),
  }));
  // Comparaison a temps constant : pas de fuite par le timing.
  return calcule.length === attendu.length && timingSafeEqual(calcule, attendu);
}

/* --- Sessions -------------------------------------------------------
 * Le cookie porte un jeton aleatoire opaque ; la base ne stocke que son
 * SHA-256. Une fuite de la table ne permet donc pas de se connecter.
 */
function hashJeton(jeton: string): Buffer {
  return createHash("sha256").update(jeton).digest();
}

export type Utilisateur = {
  id: string;
  display_name: string;
  email: string;
  role: "member" | "admin";
  /** Groupe de colles, null tant que le membre ne l'a pas indiqué. */
  groupe_colle: number | null;
  /** « Plus tard » cliqué sur la demande de groupe, pour cette session. */
  groupe_reporte: boolean;
};

/**
 * Jeton de la requête : en-tête `Authorization: Bearer` (app iOS), sinon
 * cookie (site). Un en-tête ne part jamais seul d'un autre site, donc le
 * jeton porteur n'ouvre aucune faille CSRF.
 */
async function jetonCourant(): Promise<string | null> {
  const auth = (await headers()).get("authorization");
  const m = auth ? /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(auth) : null;
  if (m) return m[1];
  return (await cookies()).get(COOKIE)?.value ?? null;
}

/**
 * Vérifie un email et un mot de passe ; renvoie l'id du compte. Même coût
 * et même erreur que l'email existe ou non : on ne révèle pas qui est inscrit.
 */
export async function verifierIdentifiants(email: string, motDePasse: string): Promise<string> {
  if (!email || !motDePasse) throw new ErreurMetier("CHAMPS_MANQUANTS");
  const u = await queryOne<{ id: string; password_hash: string }>(
    `select id, password_hash from app_user where lower(email) = lower($1)`,
    [email],
  );
  const ok = u
    ? await verifierMotDePasse(motDePasse, u.password_hash)
    : await verifierMotDePasse(motDePasse, await hashMotDePasse(randomBytes(16).toString("hex")));
  if (!u || !ok) throw new ErreurMetier("IDENTIFIANTS_INVALIDES");
  return u.id;
}

/** Enregistre une session en base et renvoie son jeton (jamais stocké en clair). */
export async function ouvrirSession(userId: string): Promise<{ jeton: string; expire: Date }> {
  const jeton = randomBytes(32).toString("base64url");
  const expire = new Date(Date.now() + DUREE_JOURS * 86_400_000);
  await query(
    `insert into user_session (token_hash, user_id, expires_at) values ($1, $2, $3)`,
    [hashJeton(jeton), userId, expire],
  );
  return { jeton, expire };
}

/**
 * Crée un compte avec un code d'invitation de la classe ; renvoie son id.
 * Le verrou sur le code sérialise les inscriptions concurrentes :
 * max_uses ne peut pas être dépassé.
 */
export async function inscrireMembre(champs: {
  email: unknown; pseudo: unknown; motDePasse: unknown; code: unknown;
}): Promise<string> {
  const email = String(champs.email ?? "").trim();
  const pseudo = String(champs.pseudo ?? "").trim();
  const motDePasse = String(champs.motDePasse ?? "");
  const code = String(champs.code ?? "").trim();
  if (!email || !pseudo || !motDePasse || !code) throw new ErreurMetier("CHAMPS_MANQUANTS");
  if (motDePasse.length < 8) throw new ErreurMetier("MOT_DE_PASSE_COURT");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ErreurMetier("EMAIL_INVALIDE");
  if (pseudo.length < 2 || pseudo.length > 40) throw new ErreurMetier("PSEUDO_INVALIDE");

  const hash = await hashMotDePasse(motDePasse);
  return tx(async (c) => {
    const inv = await c.query<{ uses: number; max_uses: number }>(
      `select uses, max_uses from invite_code where code = $1 for update`, [code]);
    if (inv.rowCount === 0 || inv.rows[0].uses >= inv.rows[0].max_uses) {
      throw new ErreurMetier("CODE_INVITATION_INVALIDE");
    }
    const existant = await c.query(`select 1 from app_user where lower(email) = lower($1)`, [email]);
    if (existant.rowCount) throw new ErreurMetier("EMAIL_DEJA_UTILISE");
    const pris = await c.query(`select 1 from app_user where lower(display_name) = lower($1)`, [pseudo]);
    if (pris.rowCount) throw new ErreurMetier("PSEUDO_DEJA_UTILISE");
    const u = await c.query<{ id: string }>(
      `insert into app_user (email, display_name, password_hash) values ($1, $2, $3) returning id`,
      [email, pseudo, hash]);
    await c.query(`update invite_code set uses = uses + 1 where code = $1`, [code]);
    return u.rows[0].id;
  });
}

/** Session du site : ouverte en base puis posée en cookie. */
export async function creerSession(userId: string): Promise<void> {
  const { jeton, expire } = await ouvrirSession(userId);
  const jar = await cookies();
  jar.set(COOKIE, jeton, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expire,
  });
}

export async function detruireSession(): Promise<void> {
  const jeton = await jetonCourant();
  if (jeton) {
    await query(`delete from user_session where token_hash = $1`, [hashJeton(jeton)]);
  }
  (await cookies()).delete(COOKIE);
}

/** Utilisateur courant, ou null. Ne leve jamais. */
export async function utilisateurCourant(): Promise<Utilisateur | null> {
  const jeton = await jetonCourant();
  if (!jeton) return null;

  return queryOne<Utilisateur>(
    `select u.id, u.display_name, u.email, u.role, u.groupe_colle, s.groupe_reporte
       from user_session s
       join app_user u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashJeton(jeton)],
  );
}

/**
 * Masque la demande de groupe de colles pour la session en cours
 * seulement : elle réapparaît à la prochaine connexion.
 */
export async function reporterDemandeGroupe(): Promise<void> {
  const jeton = await jetonCourant();
  if (!jeton) throw new ErreurMetier("NON_CONNECTE");
  await query(`update user_session set groupe_reporte = true where token_hash = $1`,
    [hashJeton(jeton)]);
}

/** Utilisateur courant obligatoire. Leve NON_CONNECTE sinon. */
export async function exigerUtilisateur(): Promise<Utilisateur> {
  const u = await utilisateurCourant();
  if (!u) throw new ErreurMetier("NON_CONNECTE");
  return u;
}

/** Administrateur obligatoire. */
export async function exigerAdmin(): Promise<Utilisateur> {
  const u = await exigerUtilisateur();
  if (u.role !== "admin") throw new ErreurMetier("NON_AUTORISE");
  return u;
}

/** Menage des sessions expirees (appele par le cron de rapprochement). */
export async function purgerSessions(): Promise<void> {
  await query(`delete from user_session where expires_at <= now()`);
}
