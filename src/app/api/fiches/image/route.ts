import { NextResponse } from "next/server";
import { tx } from "@/lib/db";
import { utilisateurCourant } from "@/lib/session";
import { messageFr, ErreurMetier } from "@/lib/errors";
import {
  DOSSIER_IMAGES, TAILLE_MAX_IMAGE, TYPES_IMAGES, detecterType, ecrire, supprimerDuDisque,
} from "@/lib/stockage";

import { lireFormulaire, verifierQuota } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * Image collée ou téléversée dans une carte. Renvoie le Markdown à
 * insérer, pour que le client n'ait jamais à fabriquer une URL.
 */
export async function POST(request: Request) {
  const u = await utilisateurCourant();
  if (!u) return NextResponse.json({ erreur: "Session expirée" }, { status: 401 });

  let nom: string | undefined;
  try {
    const form = await lireFormulaire(request, TAILLE_MAX_IMAGE);
    const fichier = form.get("image");
    if (!(fichier instanceof File) || fichier.size === 0) {
      throw new ErreurMetier("FICHIER_MANQUANT");
    }
    if (fichier.size > TAILLE_MAX_IMAGE) throw new ErreurMetier("FICHIER_TROP_GROS");

    const buf = Buffer.from(await fichier.arrayBuffer());
    const mime = detecterType(buf, fichier.type);
    if (!mime || !TYPES_IMAGES.includes(mime)) throw new ErreurMetier("TYPE_NON_AUTORISE");

    const r = await tx(async c => {
      await verifierQuota(c, u.id, buf.length);
      nom = await ecrire(DOSSIER_IMAGES, buf);
      const resultat = await c.query<{ id: number }>(
        `insert into card_image (storage_name, mime, taille, uploaded_by)
         values ($1,$2,$3,$4::uuid) returning id`, [nom, mime, buf.length, u.id]);
      return resultat.rows[0];
    });

    return NextResponse.json({ ok: true, id: r!.id, markdown: `![](/api/fiches/image/${r!.id})` });
  } catch (err) {
    if (nom) await supprimerDuDisque(DOSSIER_IMAGES, nom).catch(console.error);
    if (!(err instanceof ErreurMetier)) console.error("image carte:", err);
    return NextResponse.json({ erreur: messageFr(err) }, { status: 400 });
  }
}
