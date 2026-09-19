import "server-only";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { query, queryOne } from "./db";
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
};

export async function creerSession(userId: string): Promise<void> {
  const jeton = randomBytes(32).toString("base64url");
  const expire = new Date(Date.now() + DUREE_JOURS * 86_400_000);

  await query(
    `insert into user_session (token_hash, user_id, expires_at) values ($1, $2, $3)`,
    [hashJeton(jeton), userId, expire],
  );

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
  const jar = await cookies();
  const jeton = jar.get(COOKIE)?.value;
  if (jeton) {
    await query(`delete from user_session where token_hash = $1`, [hashJeton(jeton)]);
  }
  jar.delete(COOKIE);
}

/** Utilisateur courant, ou null. Ne leve jamais. */
export async function utilisateurCourant(): Promise<Utilisateur | null> {
  const jar = await cookies();
  const jeton = jar.get(COOKIE)?.value;
  if (!jeton) return null;

  return queryOne<Utilisateur>(
    `select u.id, u.display_name, u.email, u.role
       from user_session s
       join app_user u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashJeton(jeton)],
  );
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
