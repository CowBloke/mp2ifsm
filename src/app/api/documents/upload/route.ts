import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/lib/session";
import { tx } from "@/lib/db";
import { ErreurMetier, messageFr } from "@/lib/errors";
import { matiereDuFormulaire } from "@/lib/matieres";
import { lireFormulaire, verifierQuota } from "@/lib/uploads";
import {
  DOSSIER_DOCUMENTS, TAILLE_MAX_FICHIER, TYPES_DOCUMENTS,
  detecterType, ecrire, empreinte, supprimerDuDisque,
} from "@/lib/stockage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const u = await utilisateurCourant();
  if (!u) return NextResponse.json({ erreur: "Session expirée" }, { status: 401 });
  let stockage: string | undefined;
  try {
    const form = await lireFormulaire(request, TAILLE_MAX_FICHIER);
    const fichier = form.get("fichier");
    if (!(fichier instanceof File) || !fichier.size) throw new ErreurMetier("FICHIER_MANQUANT");
    if (fichier.size > TAILLE_MAX_FICHIER) throw new ErreurMetier("FICHIER_TROP_GROS");
    const matiere = await matiereDuFormulaire(form.get("matiere"));
    const chapitre = String(form.get("chapitre") ?? "").trim();
    if (chapitre.length > 120) throw new ErreurMetier("CHAMPS_MANQUANTS");
    const tags = [...new Set(String(form.get("tags") ?? "").split(",")
      .map(t => t.trim().toLowerCase()).filter(t => t && t.length <= 40))].slice(0, 12);
    const nom = fichier.name.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 255);
    if (!nom) throw new ErreurMetier("FICHIER_MANQUANT");
    const buf = Buffer.from(await fichier.arrayBuffer());
    const mime = detecterType(buf, fichier.type);
    if (!mime || !TYPES_DOCUMENTS[mime]) throw new ErreurMetier("TYPE_NON_AUTORISE");
    const id = await tx(async c => {
      await verifierQuota(c, u.id, buf.length);
      stockage = await ecrire(DOSSIER_DOCUMENTS, buf);
      const r = await c.query<{ id: number }>(
        `insert into document (storage_name, original_name, mime, taille, sha256,
                               subject_id, chapitre, tags, uploaded_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid) returning id`,
        [stockage, nom, mime, buf.length, empreinte(buf), matiere, chapitre || null, tags, u.id]);
      return r.rows[0].id;
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (stockage) await supprimerDuDisque(DOSSIER_DOCUMENTS, stockage).catch(console.error);
    if (!(err instanceof ErreurMetier)) console.error("upload document:", err);
    return NextResponse.json({ erreur: messageFr(err) }, { status: 400 });
  }
}
