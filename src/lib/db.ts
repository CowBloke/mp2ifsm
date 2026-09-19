import { Pool, type PoolClient } from "pg";

/*
 * Un seul pool pour tout le processus. Next.js recharge les modules en
 * developpement, donc on le memorise sur globalThis pour ne pas ouvrir
 * une nouvelle grappe de connexions a chaque rechargement.
 */
const globalForDb = globalThis as unknown as { mp2Pool?: Pool };

export const pool: Pool =
  globalForDb.mp2Pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Le Pi est petit : peu de connexions, recyclees vite.
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.mp2Pool = pool;

/* Les montants sont des centimes en bigint : on les veut en number,
 * jamais en string. Toutes les valeurs manipulees ici tiennent
 * tres largement dans un entier sur 53 bits. */
import pg from "pg";
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(text, params as never[]);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Execute une unite de travail dans UNE transaction PostgreSQL.
 *
 * Toute mutation d'argent passe obligatoirement par ici (ou par une
 * fonction SQL appelee depuis ici). Si le callback leve, la transaction
 * est annulee en entier : il n'existe aucun etat intermediaire visible.
 */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* la connexion est deja morte ; le serveur annulera de lui-meme */
    }
    throw err;
  } finally {
    client.release();
  }
}
