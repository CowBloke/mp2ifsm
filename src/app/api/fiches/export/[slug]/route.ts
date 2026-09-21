import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { utilisateurCourant } from "@/lib/session";
import { readFile } from "node:fs/promises";
import { DOSSIER_IMAGES, cheminDe } from "@/lib/stockage";
import { ecrireApkg } from "@/lib/anki";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Export d'un paquet au format .apkg, ouvrable dans Anki. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await utilisateurCourant())) return new NextResponse("Non autorisé", { status: 401 });

  const { slug } = await params;
  const deck = await queryOne<{ id: number; titre: string; matiere: string; chapitre: string }>(
    `select d.id, d.titre, coalesce(sj.nom, 'Sans matière') as matiere, d.chapitre
       from deck d left join subject sj on sj.id = d.subject_id where d.slug = $1`,
    [slug],
  );
  if (!deck) return new NextResponse("Introuvable", { status: 404 });

  const cartes = await query<{ id: number; recto: string; verso: string; anki_guid: string | null }>(
    `select id, recto, verso, anki_guid from card
      where deck_id = $1 and deleted_at is null order by id`,
    [deck.id],
  );

  const medias = new Map<string, Buffer>();
  const ids = [...new Set(cartes.flatMap(c => [...`${c.recto} ${c.verso}`.matchAll(/\/api\/fiches\/image\/(\d+)/g)].map(m => Number(m[1]))))];
  const images = ids.length ? await query<{ id: number; storage_name: string; mime: string }>(
    "select id, storage_name, mime from card_image where id = any($1::bigint[])", [ids]) : [];
  const noms = new Map<number, string>();
  for (const img of images) {
    const nom = `image-${img.id}.${img.mime.split("/")[1]}`;
    medias.set(nom, await readFile(cheminDe(DOSSIER_IMAGES, img.storage_name)));
    noms.set(img.id, nom);
  }
  const remplacer = (s: string) => s.replace(/\/api\/fiches\/image\/(\d+)/g, (url, id) => noms.get(Number(id)) ?? url);
  const archive = await ecrireApkg(
    `${deck.matiere} — ${deck.chapitre} — ${deck.titre}`,
    cartes.map((c) => ({ recto: remplacer(c.recto), verso: remplacer(c.verso), guid: c.anki_guid ?? `mp2i-${c.id}` })),
    medias,
  );

  const nom = `${slug}.apkg`;
  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(archive.length),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nom)}`,
      "cache-control": "private, no-store",
    },
  });
}
