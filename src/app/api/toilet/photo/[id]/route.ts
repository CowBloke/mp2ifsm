import { NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { stat } from "node:fs/promises";
import { queryOne } from "@/lib/db";
import { utilisateurCourant } from "@/lib/session";
import { cheminDe } from "@/lib/stockage";
import { DOSSIER_PHOTOS_TOILET, estMembreToilet } from "@/lib/toilet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Photo de preuve, réservée aux membres de Toilet! (404 pour les autres). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurCourant();
  if (!u || !(await estMembreToilet(u.id))) return new NextResponse("Introuvable", { status: 404 });

  const numero = Number((await params).id);
  if (!Number.isSafeInteger(numero) || numero <= 0) return new NextResponse("Introuvable", { status: 404 });

  const p = await queryOne<{ storage_name: string; mime: string; taille: number }>(
    `select storage_name, mime, taille from toilet_passage where id = $1 and storage_name is not null`, [numero]);
  if (!p) return new NextResponse("Introuvable", { status: 404 });

  const chemin = cheminDe(DOSSIER_PHOTOS_TOILET, p.storage_name);
  try { await stat(chemin); } catch { return new NextResponse("Fichier absent", { status: 410 }); }

  return new NextResponse(Readable.toWeb(createReadStream(chemin)) as ReadableStream, {
    headers: {
      "content-type": p.mime,
      "content-length": String(p.taille),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
