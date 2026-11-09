import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { tx } from "@/lib/db";
import { utilisateurCourant } from "@/lib/session";
import { messageFr, ErreurMetier } from "@/lib/errors";
import { TYPES_IMAGES, detecterType, ecrire, supprimerDuDisque } from "@/lib/stockage";
import { lireFormulaire, verifierQuota } from "@/lib/uploads";
import { DELAI_MINUTES, DOSSIER_PHOTOS_TOILET, TAILLE_MAX_PHOTO } from "@/lib/toilet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * Enregistre un passage, avec une photo de preuve de propreté
 * facultative (champ « photo »). Route et non action serveur : la photo
 * peut peser quelques Mo et passe par la lecture bornée de lireFormulaire.
 */
export async function POST(request: Request) {
  const u = await utilisateurCourant();
  if (!u) return NextResponse.json({ erreur: "Session expirée" }, { status: 401 });

  let nom: string | undefined;
  try {
    const form = await lireFormulaire(request, TAILLE_MAX_PHOTO);
    const fichier = form.get("photo");
    let photo: { buf: Buffer; mime: string } | null = null;
    if (fichier instanceof File && fichier.size > 0) {
      if (fichier.size > TAILLE_MAX_PHOTO) throw new ErreurMetier("FICHIER_TROP_GROS");
      const buf = Buffer.from(await fichier.arrayBuffer());
      const mime = detecterType(buf, fichier.type);
      if (!mime || !TYPES_IMAGES.includes(mime)) throw new ErreurMetier("TYPE_NON_AUTORISE");
      photo = { buf, mime };
    }

    const r = await tx(async c => {
      // Verrou sur la ligne du membre : deux clics simultanés ne
      // contournent pas le délai entre passages.
      const membre = await c.query(
        `select 1 from toilet_membre where user_id = $1::uuid for update`, [u.id]);
      if (membre.rowCount === 0) throw new ErreurMetier("NON_AUTORISE");
      const recent = await c.query(
        `select 1 from toilet_passage
          where user_id = $1::uuid and cree_le > now() - make_interval(mins => $2)`, [u.id, DELAI_MINUTES]);
      if (recent.rowCount) throw new ErreurMetier("TOILET_TROP_TOT");

      if (photo) {
        await verifierQuota(c, u.id, photo.buf.length);
        nom = await ecrire(DOSSIER_PHOTOS_TOILET, photo.buf);
      }
      const ins = await c.query<{ id: number; total: number }>(
        `insert into toilet_passage (user_id, storage_name, mime, taille)
         values ($1::uuid, $2, $3, $4)
         returning id, (select count(*)::int + 1 from toilet_passage where user_id = $1::uuid) as total`,
        [u.id, nom ?? null, photo?.mime ?? null, photo?.buf.length ?? null]);
      return ins.rows[0];
    });

    revalidatePath("/toilet");
    return NextResponse.json({ ok: true, id: r.id, total: r.total });
  } catch (err) {
    if (nom) await supprimerDuDisque(DOSSIER_PHOTOS_TOILET, nom).catch(console.error);
    if (!(err instanceof ErreurMetier)) console.error("passage toilet:", err);
    const statut = err instanceof ErreurMetier && err.code === "NON_AUTORISE" ? 404 : 400;
    return NextResponse.json({ erreur: messageFr(err) }, { status: statut });
  }
}
