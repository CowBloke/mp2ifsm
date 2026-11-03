import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { utilisateurCourant } from "@/lib/session";
import { tx } from "@/lib/db";
import { ErreurMetier, messageFr } from "@/lib/errors";
import { lireApkg, type NoteImportee } from "@/lib/anki";
import {
  DOSSIER_IMAGES, TYPES_IMAGES, cheminDe, detecterType, ecrire, supprimerDuDisque, TAILLE_MAX_IMAGE,
} from "@/lib/stockage";
import { matiereDuFormulaire } from "@/lib/matieres";
import { dossierDuFormulaire } from "@/lib/dossiers-formulaire";

import { lireFormulaire, verifierQuota } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const TAILLE_MAX_APKG = 100 * 1024 * 1024;

type Media = { mime: string; donnees: Buffer };
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/*
 * Import d'un .apkg.
 *
 * Sans champ `deck` : crée un nouveau paquet partagé. Avec `deck` (id
 * d'un paquet dont on est créateur, ou admin) : met à jour son contenu.
 * Les cartes sont rapprochées par GUID Anki — une carte modifiée garde
 * son id, donc la progression de chacun ; chaque changement laisse une
 * version dans l'historique. Les images identiques à celles déjà
 * présentes dans le paquet sont réutilisées, pas réécrites.
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

    const paquet = await lireApkg(Buffer.from(await fichier.arrayBuffer()));
    if (paquet.notes.length === 0) throw new ErreurMetier("APKG_VIDE");

    const medias = new Map<string, Media>();
    for (const [nom, donnees] of paquet.medias) {
      const mime = detecterType(donnees, "");
      if (!mime || !TYPES_IMAGES.includes(mime)) continue;   // on ignore sons et vidéos
      if (donnees.length > TAILLE_MAX_IMAGE) throw new ErreurMetier("FICHIER_TROP_GROS");
      medias.set(nom, { mime, donnees });
    }

    const deckBrut = String(form.get("deck") ?? "").trim();
    if (deckBrut) {
      const deckId = Number(deckBrut);
      if (!Number.isSafeInteger(deckId) || deckId <= 0) throw new ErreurMetier("PAQUET_INTROUVABLE");
      const supprimerAbsentes = form.get("supprimer_absentes") === "on";
      const resultat = await tx((c) => mettreAJour(c, u, deckId, paquet.notes, medias, supprimerAbsentes, ecrits));
      return NextResponse.json({ ok: true, ...resultat });
    }

    const titre = (String(form.get("titre") ?? "").trim()
      // « Parent::Enfant » dans Anki : seul le dernier niveau sert de titre.
      || paquet.nom?.split("::").pop()?.trim()
      || fichier.name.replace(/\.apkg$/i, "")).slice(0, 120);
    if (titre.length < 2) throw new ErreurMetier("CHAMPS_MANQUANTS");

    const resultat = await tx(async (c) => {
      const ids = await ecrireMedias(c, u.id, medias, paquet.notes, ecrits);

      // Dans un dossier, le paquet prend la matière de ce dossier.
      const dossier = await dossierDuFormulaire(form.get("dossier"), "deck", c);
      const matiere = dossier ? dossier.subject_id : await matiereDuFormulaire(form.get("matiere"), c);
      const nomMatiere = matiere === null ? "" : (await c.query<{ nom: string }>(
        `select nom from subject where id = $1`, [matiere])).rows[0]?.nom ?? "";
      const base = `${nomMatiere}-${titre}`.toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 58) || "import";
      let slug = base;
      for (let n = 2; ; n++) {
        const pris = await c.query(`select 1 from deck where slug = $1`, [slug]);
        if (pris.rowCount === 0) break;
        slug = `${base.slice(0, 54)}-${n}`;
      }

      // La colonne chapitre (historique) reprend le titre.
      const d = await c.query<{ id: number }>(
        `insert into deck (slug, titre, subject_id, folder_id, chapitre, description, created_by)
         values ($1,$2,$3,$4,$5,$6,$7::uuid) returning id`,
        [slug, titre, matiere, dossier?.id ?? null, titre, null, u.id],
      );
      const deckId = d.rows[0].id;
      await c.query(`insert into deck_subscription (user_id, deck_id) values ($1::uuid, $2)`,
        [u.id, deckId]);

      let crees = 0;
      for (const note of paquet.notes) {
        const { recto, verso } = remplacer(note, ids);
        await c.query(
          `insert into card (deck_id, recto, verso, author_id, anki_guid)
           values ($1,$2,$3,$4::uuid,$5)
           on conflict (deck_id, anki_guid) where anki_guid is not null
           do update set recto = excluded.recto, verso = excluded.verso,
                         updated_at = now()`,
          [deckId, recto, verso, u.id, note.guid],
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

function remplacer(note: NoteImportee, ids: Map<string, number>) {
  const r = (t: string) => {
    let out = t;
    for (const [nom, id] of ids) {
      out = out.split(`anki-media:${encodeURIComponent(nom)}`).join(`/api/fiches/image/${id}`);
    }
    return out.slice(0, 8000);
  };
  return { recto: r(note.recto), verso: r(note.verso) };
}

/** Écrit les médias référencés par au moins une note, sauf ceux déjà connus (`connus` : hash → id). */
async function ecrireMedias(
  c: PoolClient, userId: string, medias: Map<string, Media>, notes: NoteImportee[],
  ecrits: string[], connus = new Map<string, number>(),
): Promise<Map<string, number>> {
  const texte = notes.map((n) => n.recto + "\n" + n.verso).join("\n");
  const ids = new Map<string, number>();
  const aEcrire: Array<[string, Media, string]> = [];
  for (const [nom, m] of medias) {
    if (!texte.includes(`anki-media:${encodeURIComponent(nom)}`)) continue;
    const h = sha(m.donnees);
    const deja = connus.get(h);
    if (deja !== undefined) ids.set(nom, deja);
    else aEcrire.push([nom, m, h]);
  }
  await verifierQuota(c, userId, aEcrire.reduce((n, [, m]) => n + m.donnees.length, 0));
  for (const [nom, { mime, donnees }, h] of aEcrire) {
    const stockage = await ecrire(DOSSIER_IMAGES, donnees);
    ecrits.push(stockage);
    const r = await c.query<{ id: number }>(
      `insert into card_image (storage_name, mime, taille, uploaded_by)
       values ($1,$2,$3,$4::uuid) returning id`,
      [stockage, mime, donnees.length, userId],
    );
    ids.set(nom, r.rows[0].id);
    connus.set(h, r.rows[0].id);
  }
  return ids;
}

async function mettreAJour(
  c: PoolClient,
  u: { id: string; role: string },
  deckId: number,
  notes: NoteImportee[],
  medias: Map<string, Media>,
  supprimerAbsentes: boolean,
  ecrits: string[],
) {
  const d = await c.query<{ slug: string; titre: string }>(
    `select slug, titre from deck
      where id = $1 and archived_at is null and ($3::boolean or created_by = $2::uuid)
      for update`,
    [deckId, u.id, u.role === "admin"],
  );
  if (d.rowCount === 0) throw new ErreurMetier("NON_AUTORISE");

  const existantes = await c.query<{ id: number; recto: string; verso: string; anki_guid: string | null; deleted_at: string | null }>(
    `select id, recto, verso, anki_guid, deleted_at from card where deck_id = $1`, [deckId]);

  // Images déjà utilisées par le paquet, reconnues par leur contenu.
  const refs = new Set<number>();
  for (const k of existantes.rows) {
    for (const m of `${k.recto}\n${k.verso}`.matchAll(/\/api\/fiches\/image\/(\d+)/g)) refs.add(Number(m[1]));
  }
  const connus = new Map<string, number>();
  if (refs.size > 0) {
    const imgs = await c.query<{ id: number; storage_name: string }>(
      `select id, storage_name from card_image where id = any($1::bigint[])`, [[...refs]]);
    for (const img of imgs.rows) {
      try { connus.set(sha(await readFile(cheminDe(DOSSIER_IMAGES, img.storage_name))), img.id); }
      catch { /* fichier absent : l'image sera réécrite */ }
    }
  }
  const ids = await ecrireMedias(c, u.id, medias, notes, ecrits, connus);

  const parGuid = new Map(existantes.rows.filter((k) => k.anki_guid).map((k) => [k.anki_guid!, k]));
  const vus = new Set<string>();
  let ajoutees = 0, modifiees = 0, inchangees = 0, supprimees = 0;

  for (const note of notes) {
    const { recto, verso } = remplacer(note, ids);
    if (!recto.trim() || !verso.trim()) continue;
    vus.add(note.guid);
    const k = parGuid.get(note.guid);
    if (!k) {
      await c.query(
        `insert into card (deck_id, recto, verso, author_id, anki_guid) values ($1,$2,$3,$4::uuid,$5)`,
        [deckId, recto, verso, u.id, note.guid]);
      ajoutees++;
    } else if (k.recto === recto && k.verso === verso && !k.deleted_at) {
      inchangees++;
    } else {
      await c.query(
        `update card set recto = $2, verso = $3, updated_at = now(),
                deleted_at = null, deleted_by = null where id = $1`,
        [k.id, recto, verso]);
      if (k.recto !== recto || k.verso !== verso) {
        await c.query(
          `insert into card_revision (card_id, recto, verso, edited_by, motif)
           values ($1,$2,$3,$4::uuid,'Mise à jour depuis Anki')`,
          [k.id, recto, verso, u.id]);
      }
      modifiees++;
    }
  }

  // Seules les cartes venues d'Anki peuvent être retirées : celles
  // ajoutées à la main dans le portail ne sont jamais touchées.
  if (supprimerAbsentes) {
    const absentes = existantes.rows
      .filter((k) => k.anki_guid && !k.deleted_at && !vus.has(k.anki_guid))
      .map((k) => k.id);
    if (absentes.length > 0) {
      await c.query(
        `update card set deleted_at = now(), deleted_by = $2::uuid where id = any($1::bigint[])`,
        [absentes, u.id]);
      supprimees = absentes.length;
    }
  }

  return { slug: d.rows[0].slug, titre: d.rows[0].titre, ajoutees, modifiees, inchangees, supprimees, images: ids.size };
}
