import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import { utilisateurCourant } from "@/lib/session";
import { messageFr, ErreurMetier } from "@/lib/errors";
import { TYPES_IMAGES, detecterType, ecrire, supprimerDuDisque } from "@/lib/stockage";
import { lireFormulaire, verifierQuota } from "@/lib/uploads";
import { DOSSIER_PHOTOS_TOILET, TAILLE_MAX_PHOTO } from "@/lib/toilet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * Photo ajoutée après coup (wifi trop faible aux toilettes du bas) :
 * uniquement par l'auteur du passage, et seulement s'il n'en a pas
 * encore. Le passage garde son heure d'origine.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurCourant();
  if (!u) return NextResponse.json({ erreur: "Session expirée" }, { status: 401 });

  let nom: string | undefined;
  try {
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ErreurMetier("NON_AUTORISE");

    const form = await lireFormulaire(request, TAILLE_MAX_PHOTO);
    const fichier = form.get("photo");
    if (!(fichier instanceof File) || fichier.size === 0) throw new ErreurMetier("FICHIER_MANQUANT");
    if (fichier.size > TAILLE_MAX_PHOTO) throw new ErreurMetier("FICHIER_TROP_GROS");
    const buf = Buffer.from(await fichier.arrayBuffer());
    const mime = detecterType(buf, fichier.type);
    if (!mime || !TYPES_IMAGES.includes(mime)) throw new ErreurMetier("TYPE_NON_AUTORISE");

    await tx(async c => {
      const p = await c.query<{ storage_name: string | null }>(
        `select storage_name from toilet_passage where id = $1 and user_id = $2::uuid for update`, [id, u.id]);
      if (p.rowCount === 0) throw new ErreurMetier("NON_AUTORISE");
      if (p.rows[0].storage_name) throw new ErreurMetier("TOILET_DEJA_PROUVE");
      await verifierQuota(c, u.id, buf.length);
      nom = await ecrire(DOSSIER_PHOTOS_TOILET, buf);
      await c.query(`update toilet_passage set storage_name = $2, mime = $3, taille = $4 where id = $1`,
        [id, nom, mime, buf.length]);
    });

    revalidatePath("/toilet");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (nom) await supprimerDuDisque(DOSSIER_PHOTOS_TOILET, nom).catch(console.error);
    if (!(err instanceof ErreurMetier)) console.error("photo toilet:", err);
    const statut = err instanceof ErreurMetier && err.code === "NON_AUTORISE" ? 404 : 400;
    return NextResponse.json({ erreur: messageFr(err) }, { status: statut });
  }
}
