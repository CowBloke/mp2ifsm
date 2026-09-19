import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { stat } from "node:fs/promises";
import { queryOne } from "@/lib/db";
import { utilisateurCourant } from "@/lib/session";
import { DOSSIER_IMAGES, cheminDe } from "@/lib/stockage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Sert une image de carte, session obligatoire. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await utilisateurCourant())) return new NextResponse("Non autorisé", { status: 401 });

  const { id } = await params;
  const numero = Number(id);
  if (!Number.isSafeInteger(numero) || numero <= 0) {
    return new NextResponse("Introuvable", { status: 404 });
  }

  const img = await queryOne<{ storage_name: string; mime: string; taille: string }>(
    `select storage_name, mime, taille from card_image where id = $1`, [numero]);
  if (!img) return new NextResponse("Introuvable", { status: 404 });

  const chemin = cheminDe(DOSSIER_IMAGES, img.storage_name);
  try { await stat(chemin); } catch { return new NextResponse("Fichier absent", { status: 410 }); }

  return new NextResponse(Readable.toWeb(createReadStream(chemin)) as ReadableStream, {
    headers: {
      "content-type": img.mime,
      "content-length": String(img.taille),
      // Immuable : l'identifiant ne désigne jamais une autre image.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
