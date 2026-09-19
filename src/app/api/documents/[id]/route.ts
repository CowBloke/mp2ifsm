import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { open } from "node:fs/promises";
import { queryOne } from "@/lib/db";
import { utilisateurCourant } from "@/lib/session";
import { DOSSIER_DOCUMENTS, cheminDe } from "@/lib/stockage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * Téléchargement / prévisualisation.
 *
 * La session est vérifiée AVANT toute lecture disque. Le client ne
 * fournit qu'un identifiant numérique ; le nom réel du fichier vient
 * de la base. Il n'existe donc aucune URL devinable vers le contenu.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const u = await utilisateurCourant();
  if (!u) return new NextResponse("Non autorisé", { status: 401 });

  const { id } = await params;
  const numero = Number(id);
  if (!Number.isSafeInteger(numero) || numero <= 0) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  const doc = await queryOne<{
    storage_name: string; original_name: string; mime: string; taille: string;
  }>(
    `select storage_name, original_name, mime, taille
       from document where id = $1 and deleted_at is null`,
    [numero],
  );
  if (!doc) return new NextResponse("Introuvable", { status: 404 });

  const chemin = cheminDe(DOSSIER_DOCUMENTS, doc.storage_name);
  let fichier;
  try {
    fichier = await open(chemin, "r");
  } catch {
    console.error(`document ${numero}: fichier absent du disque`);
    return new NextResponse("Fichier absent", { status: 410 });
  }

  // Les PDF et les images s'affichent dans la page ; le reste se
  // télécharge. `?dl=1` force le téléchargement dans tous les cas.
  const forcerTelechargement = new URL(request.url).searchParams.get("dl") === "1";
  const previsualisable = doc.mime === "application/pdf" || doc.mime.startsWith("image/");
  const disposition = !forcerTelechargement && previsualisable ? "inline" : "attachment";

  const taille = (await fichier.stat()).size;
  let debut = 0, fin = taille - 1;
  const range = request.headers.get("range");
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (m && (m[1] || m[2])) {
      if (m[1]) { debut = Number(m[1]); fin = m[2] ? Math.min(fin, Number(m[2])) : fin; }
      else debut = Math.max(0, taille - Number(m[2]));
    }
    if (!m || (!m[1] && !m[2]) || !Number.isSafeInteger(debut) || !Number.isSafeInteger(fin)
        || debut > fin || debut >= taille) {
      await fichier.close();
      return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${taille}` } });
    }
  }
  const flux = Readable.toWeb(fichier.createReadStream({ start: debut, end: fin })) as ReadableStream;

  return new NextResponse(flux, {
    status: range ? 206 : 200,
    headers: {
      "content-type": doc.mime,
      "content-length": String(fin - debut + 1),
      "accept-ranges": "bytes",
      ...(range ? { "content-range": `bytes ${debut}-${fin}/${taille}` } : {}),
      // RFC 5987 : le nom d'origine peut contenir des accents.
      "content-disposition":
        `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.original_name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      // Un PDF ou un SVG hostile ne doit pas s'exécuter dans notre origine.
      "content-security-policy": "default-src 'none'; object-src 'none'; frame-ancestors 'self'",
    },
  });
}
