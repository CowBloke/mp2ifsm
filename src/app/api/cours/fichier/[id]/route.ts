import { NextResponse } from "next/server";
import { cheminCours, lireFichierCours } from "@/lib/cours";
import { envoyerFichier } from "@/lib/flux";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PDF d'un chapitre, pour les membres (plages d'octets pour la visionneuse). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await utilisateurCourant())) return new NextResponse("Non autorisé", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return new NextResponse("Introuvable", { status: 404 });
  const f = await lireFichierCours(id);
  if (!f) return new NextResponse("Introuvable", { status: 404 });
  return envoyerFichier(request, cheminCours(f.storage_name), {
    mime: "application/pdf", nom: `${f.titre}.pdf`, enLigne: true,
  });
}
