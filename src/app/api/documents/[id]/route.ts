import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { envoyerFichier } from "@/lib/flux";
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

  // Les PDF et les images s'affichent dans la page ; le reste se
  // télécharge. `?dl=1` force le téléchargement dans tous les cas.
  const forcerTelechargement = new URL(request.url).searchParams.get("dl") === "1";
  const previsualisable = doc.mime === "application/pdf" || doc.mime.startsWith("image/");
  return envoyerFichier(request, cheminDe(DOSSIER_DOCUMENTS, doc.storage_name), {
    mime: doc.mime, nom: doc.original_name, enLigne: !forcerTelechargement && previsualisable,
  });
}
