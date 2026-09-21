import { NextResponse } from "next/server";
import { utilisateurCourant } from "@/lib/session";
import { tx } from "@/lib/db";
import { ErreurMetier, messageFr } from "@/lib/errors";
import { lireApkg } from "@/lib/anki";
import { DOSSIER_IMAGES, TYPES_IMAGES, detecterType, ecrire, supprimerDuDisque, TAILLE_MAX_IMAGE } from "@/lib/stockage";
import { matiereDuFormulaire } from "@/lib/matieres";

import { lireFormulaire, verifierQuota } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TAILLE_MAX_APKG = 100 * 1024 * 1024;

/*
 * Import d'un .apkg dans un paquet de la classe.
 *
 * Chaque import crée un nouveau paquet partagé. Les GUID Anki sont
 * conservés pour les futurs exports.
 */
export async function POST(request: Request) {
  const u = await utilisateurCourant();
  if (!u) return NextResponse.json({ erreur: "Session expirée" }, { status: 401 });

  const ecrits: string[] = [];
  try {
    const form = await lireFormulaire(request, TAILLE_MAX_APKG);
    const fichier = form.get("apkg");
    if (!(fichier instanceof File) || fichier.size === 0) {
      throw new ErreurMetier("FICHIER_MANQUANT");
    }
    if (fichier.size > TAILLE_MAX_APKG) throw new ErreurMetier("FICHIER_TROP_GROS");

    const matiere = await matiereDuFormulaire(form.get("matiere"));
    const chapitre = String(form.get("chapitre") ?? "").trim();
    if (!chapitre || chapitre.length > 120) throw new ErreurMetier("CHAMPS_MANQUANTS");

    const paquet = await lireApkg(Buffer.from(await fichier.arrayBuffer()));
    if (paquet.notes.length === 0) throw new ErreurMetier("APKG_VIDE");

    const titre = (String(form.get("titre") ?? "").trim()
      || paquet.nom
      || fichier.name.replace(/\.apkg$/i, "")).slice(0, 120);

    // Les images du paquet sont d'abord écrites sur le SSD, puis les
    // références <img src="nom"> sont réécrites vers nos URL.
    const correspondance = new Map<string, { mime: string; donnees: Buffer }>();
    for (const [nom, donnees] of paquet.medias) {
      const mime = detecterType(donnees, "");
      if (!mime || !TYPES_IMAGES.includes(mime)) continue;   // on ignore sons et vidéos
      if (donnees.length > TAILLE_MAX_IMAGE) throw new ErreurMetier("FICHIER_TROP_GROS");
      correspondance.set(nom, { mime, donnees });
    }

    const resultat = await tx(async (c) => {
      await verifierQuota(c, u.id, [...correspondance.values()].reduce((n, m) => n + m.donnees.length, 0));
      const ids = new Map<string, number>();
      for (const [nom, { mime, donnees }] of correspondance) {
        const stockage = await ecrire(DOSSIER_IMAGES, donnees);
        ecrits.push(stockage);
        const r = await c.query<{ id: number }>(
          `insert into card_image (storage_name, mime, taille, uploaded_by)
           values ($1,$2,$3,$4::uuid) returning id`,
          [stockage, mime, donnees.length, u.id],
        );
        ids.set(nom, r.rows[0].id);
      }

      const nomMatiere = matiere === null ? "" : (await c.query<{ nom: string }>(
        `select nom from subject where id = $1`, [matiere])).rows[0]?.nom ?? "";
      const base = `${nomMatiere}-${chapitre}-${titre}`.toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 58) || "import";
      let slug = base;
      for (let n = 2; ; n++) {
        const pris = await c.query(`select 1 from deck where slug = $1`, [slug]);
        if (pris.rowCount === 0) break;
        slug = `${base.slice(0, 54)}-${n}`;
      }

      const d = await c.query<{ id: number }>(
        `insert into deck (slug, titre, subject_id, chapitre, description, created_by)
         values ($1,$2,$3,$4,$5,$6::uuid) returning id`,
        [slug, titre, matiere, chapitre,
         `Importé depuis Anki par ${u.display_name}`, u.id],
      );
      const deckId = d.rows[0].id;
      await c.query(`insert into deck_subscription (user_id, deck_id) values ($1::uuid, $2)`,
        [u.id, deckId]);

      let crees = 0;
      for (const note of paquet.notes) {
        const remplacer = (t: string) => {
          let out = t;
          for (const [nom, id] of ids) {
            out = out.split(`anki-media:${encodeURIComponent(nom)}`).join(`/api/fiches/image/${id}`);
          }
          return out;
        };

        await c.query(
          `insert into card (deck_id, recto, verso, author_id, anki_guid)
           values ($1,$2,$3,$4::uuid,$5)
           on conflict (deck_id, anki_guid) where anki_guid is not null
           do update set recto = excluded.recto, verso = excluded.verso,
                         updated_at = now()`,
          [deckId, remplacer(note.recto).slice(0, 8000),
           remplacer(note.verso).slice(0, 8000), u.id, note.guid],
        );
        crees++;
      }
      return { slug, titre, crees, images: ids.size };
    });

    return NextResponse.json({ ok: true, ...resultat });
  } catch (err) {
    await Promise.all(ecrits.map(n => supprimerDuDisque(DOSSIER_IMAGES, n).catch(console.error)));
    if (!(err instanceof ErreurMetier)) console.error("import apkg:", err);
    return NextResponse.json({ erreur: messageFr(err) }, { status: 400 });
  }
}
