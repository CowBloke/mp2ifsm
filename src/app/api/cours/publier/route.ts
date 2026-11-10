import { NextResponse } from "next/server";
import { ErreurMetier, messageFr } from "@/lib/errors";
import { refusJetonService } from "@/lib/jeton-service";
import { lireFormulaire } from "@/lib/uploads";
import {
  TAILLE_MAX_COURS, catalogue, lierPaquets, publierChapitre, publierFichier, retirerChapitre, retirerFichier,
} from "@/lib/cours";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * Publication de la rubrique Cours par la source de contenu externe
 * (jeton COURS_TOKEN). Ce jeton ne touche qu'aux tables cours_* : ni
 * comptes, ni contenus des membres.
 *
 *   GET                                   → catalogue actuel
 *   POST JSON { action: "chapitre", cle, titre, matiere?, numero?, resume?, position? }
 *   POST JSON { action: "paquets", chapitre, slugs: [...] }
 *   POST JSON { action: "retirer-fichier", chapitre, cle }
 *   POST JSON { action: "retirer-chapitre", cle }
 *   POST multipart : meta (JSON { chapitre, cle, genre, titre, position? }),
 *                    fichier (PDF), pages (JSON : texte de chaque page)
 */
export async function GET(request: Request) {
  const refus = refusJetonService(request, "COURS_TOKEN");
  if (refus) return refus;
  // Vue sans membre : aucun état de révision (uuid nul, jamais attribué).
  return NextResponse.json({ chapitres: await catalogue("00000000-0000-0000-0000-000000000000") });
}

export async function POST(request: Request) {
  const refus = refusJetonService(request, "COURS_TOKEN");
  if (refus) return refus;
  try {
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await lireFormulaire(request, TAILLE_MAX_COURS + 32 * 1024 * 1024);
      const fichier = form.get("fichier");
      if (!(fichier instanceof File) || !fichier.size) throw new ErreurMetier("FICHIER_MANQUANT");
      const meta = JSON.parse(String(form.get("meta") ?? "{}"));
      const pages = JSON.parse(String(form.get("pages") ?? "[]"));
      return NextResponse.json(await publierFichier(meta, Buffer.from(await fichier.arrayBuffer()), pages));
    }
    const b = await request.json().catch(() => ({})) as Record<string, unknown>;
    switch (b.action) {
      case "chapitre": return NextResponse.json(await publierChapitre(b));
      case "paquets": return NextResponse.json(await lierPaquets(b.chapitre, b.slugs));
      case "retirer-fichier": await retirerFichier(b.chapitre, b.cle); return NextResponse.json({ ok: true });
      case "retirer-chapitre": await retirerChapitre(b.cle); return NextResponse.json({ ok: true });
      default: throw new ErreurMetier("CHAMPS_MANQUANTS");
    }
  } catch (err) {
    if (err instanceof SyntaxError) err = new ErreurMetier("CHAMPS_MANQUANTS");
    if (!(err instanceof ErreurMetier)) console.error("publication cours:", err);
    return NextResponse.json({ erreur: messageFr(err) }, { status: err instanceof ErreurMetier ? 400 : 500 });
  }
}
