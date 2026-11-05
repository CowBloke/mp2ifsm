import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { open } from "node:fs/promises";
import { queryOne } from "@/lib/db";
import { utilisateurCourant } from "@/lib/session";
import { cheminVideo } from "@/lib/videos-rendu";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * Lecture d'une vidéo (MP4, plages d'octets pour le lecteur) ou de sa
 * couverture (`?couverture=1`). Session vérifiée avant tout accès disque.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurCourant();
  if (!u) return new NextResponse("Non autorisé", { status: 401 });
  const numero = Number((await params).id);
  if (!Number.isSafeInteger(numero) || numero <= 0) return new NextResponse("Introuvable", { status: 404 });

  const v = await queryOne<{ storage_name: string; poster_name: string }>(
    `select storage_name, poster_name from video where id = $1 and statut = 'pret'`, [numero]);
  if (!v) return new NextResponse("Introuvable", { status: 404 });

  const couverture = new URL(request.url).searchParams.get("couverture") === "1";
  const mime = couverture ? "image/jpeg" : "video/mp4";
  let fichier;
  try {
    fichier = await open(cheminVideo(couverture ? v.poster_name : v.storage_name), "r");
  } catch {
    return new NextResponse("Fichier absent", { status: 410 });
  }

  const taille = (await fichier.stat()).size;
  let debut = 0, fin = taille - 1;
  const range = couverture ? null : request.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] || m[2])) {
      if (m[1]) { debut = Number(m[1]); fin = m[2] ? Math.min(fin, Number(m[2])) : fin; }
      else debut = Math.max(0, taille - Number(m[2]));
    }
    if (!m || (!m[1] && !m[2]) || debut > fin || debut >= taille) {
      await fichier.close();
      return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${taille}` } });
    }
  }
  const flux = Readable.toWeb(fichier.createReadStream({ start: debut, end: fin })) as ReadableStream;
  return new NextResponse(flux, {
    status: range ? 206 : 200,
    headers: {
      "content-type": mime,
      "content-length": String(fin - debut + 1),
      "accept-ranges": "bytes",
      ...(range ? { "content-range": `bytes ${debut}-${fin}/${taille}` } : {}),
      // Fichiers immuables : un nouvel id à chaque vidéo.
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; frame-ancestors 'self'",
    },
  });
}
