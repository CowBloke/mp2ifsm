import "server-only";
import { mkdir, statfs } from "node:fs/promises";
import type { PoolClient } from "pg";
import { ErreurMetier } from "./errors";
import { RACINE, QUOTA_MEMBRE, PLAFOND_GLOBAL } from "./stockage";

// Documents, pasted images and Anki media share one lock and one budget.
export async function verifierQuota(c: PoolClient, userId: string, taille: number) {
  await c.query("select pg_advisory_xact_lock(4260, 1)");
  const r = await c.query<{ membre: number; total: number }>(
    `select coalesce(sum(taille) filter (where uploaded_by = $1::uuid), 0)::bigint as membre,
            coalesce(sum(taille), 0)::bigint as total
       from (select taille, uploaded_by from document union all
             select taille, uploaded_by from card_image) fichiers`, [userId]);
  if (![QUOTA_MEMBRE, PLAFOND_GLOBAL].every(n => Number.isSafeInteger(n) && n > 0)
      || r.rows[0].membre + taille > QUOTA_MEMBRE
      || r.rows[0].total + taille > PLAFOND_GLOBAL) throw new ErreurMetier("QUOTA_DEPASSE");
  await mkdir(RACINE, { recursive: true, mode: 0o700 });
  const disque = await statfs(RACINE);
  if (disque.bavail * disque.bsize - taille < 5 * 1024 ** 3) {
    throw new ErreurMetier("ESPACE_INSUFFISANT");
  }
}

// Bound the stream before multipart parsing, including chunked requests.
export async function lireFormulaire(request: Request, maximum: number): Promise<FormData> {
  const origine = request.headers.get("origin");
  const attendue = process.env.PUBLIC_ORIGIN ?? new URL(request.url).origin;
  const origines = new Set([attendue]);
  const alias = new URL(attendue);
  if (alias.hostname.includes(".") && !/^[\d.]+$/.test(alias.hostname)) {
    alias.hostname = alias.hostname.startsWith("www.") ? alias.hostname.slice(4) : `www.${alias.hostname}`;
    origines.add(alias.origin);
  }
  if ((origine && !origines.has(origine)) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ErreurMetier("NON_AUTORISE");
  }
  const limite = maximum + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limite) throw new ErreurMetier("FICHIER_TROP_GROS");
  const lecteur = request.body?.getReader();
  if (!lecteur) throw new ErreurMetier("FICHIER_MANQUANT");
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  try {
    while (true) {
      const { value, done } = await lecteur.read();
      if (done) break;
      taille += value.byteLength;
      if (taille > limite) {
        await lecteur.cancel();
        throw new ErreurMetier("FICHIER_TROP_GROS");
      }
      morceaux.push(value);
    }
  } finally { lecteur.releaseLock(); }
  return new Response(Buffer.concat(morceaux), {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  }).formData();
}
