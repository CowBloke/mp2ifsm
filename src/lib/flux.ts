import "server-only";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { open } from "node:fs/promises";

/*
 * Envoi d'un fichier privé avec les plages d'octets (visionneuses PDF,
 * lecteurs). L'appelant a déjà vérifié la session et résolu le chemin
 * depuis la base : le client ne fournit jamais de nom de fichier.
 */
export async function envoyerFichier(
  request: Request,
  chemin: string,
  { mime, nom, enLigne }: { mime: string; nom: string; enLigne: boolean },
): Promise<NextResponse> {
  let fichier;
  try {
    fichier = await open(chemin, "r");
  } catch {
    console.error(`fichier absent du disque : ${nom}`);
    return new NextResponse("Fichier absent", { status: 410 });
  }

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
      "content-type": mime,
      "content-length": String(fin - debut + 1),
      "accept-ranges": "bytes",
      ...(range ? { "content-range": `bytes ${debut}-${fin}/${taille}` } : {}),
      // RFC 5987 : le nom d'origine peut contenir des accents.
      "content-disposition": `${enLigne ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      // Un PDF ou un SVG hostile ne doit pas s'exécuter dans notre origine.
      "content-security-policy": "default-src 'none'; object-src 'none'; frame-ancestors 'self'",
    },
  });
}
