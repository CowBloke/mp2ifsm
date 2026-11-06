import { NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { utilisateurCourant } from "@/lib/session";
import { tx } from "@/lib/db";
import { ErreurMetier, messageFr } from "@/lib/errors";
import { matiereDuFormulaire } from "@/lib/matieres";
import { lireFormulaire, verifierQuota } from "@/lib/uploads";
import { CLIPS_MAX, TAILLE_MAX_MUSIQUE, TAILLE_MAX_VIDEO, lireMontage } from "@/lib/videos-montage";
import { DOSSIER_VIDEOS, cheminVideo, traiterFile } from "@/lib/videos-rendu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Signatures des conteneurs produits par MediaRecorder. */
function estVideo(buf: Buffer): boolean {
  const webm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  const mp4 = buf.subarray(4, 8).toString("latin1") === "ftyp";
  return webm || mp4;
}

/* Formats audio courants d'un téléphone : MP3, M4A/AAC, OGG/Opus, WAV, FLAC, WebM. */
function estAudio(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const debut = buf.subarray(0, 4).toString("latin1");
  if (debut.startsWith("ID3")) return true;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true; // trame MP3 / ADTS
  if (debut === "OggS" || debut === "fLaC") return true;
  if (debut === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WAVE") return true;
  return estVideo(buf); // M4A (ftyp) et WebM audio
}

/*
 * Publication d'une vidéo : les clips bruts enregistrés dans l'app et la
 * description du montage. La vidéo finale est rendue en arrière-plan.
 */
export async function POST(request: Request) {
  const u = await utilisateurCourant();
  if (!u) return NextResponse.json({ erreur: "Session expirée" }, { status: 401 });
  const ecrits: string[] = [];
  try {
    const form = await lireFormulaire(request, TAILLE_MAX_VIDEO);
    const titre = String(form.get("titre") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    if (!titre || titre.length > 120 || description.length > 1000) throw new ErreurMetier("CHAMPS_MANQUANTS");
    const clips = form.getAll("clips").filter((f): f is File => f instanceof File && f.size > 0);
    if (clips.length === 0 || clips.length > CLIPS_MAX) throw new ErreurMetier("FICHIER_MANQUANT");
    // Musique importée du téléphone : rangée après les clips dans les sources.
    const fichierMusique = form.get("musique");
    const musique = fichierMusique instanceof File && fichierMusique.size > 0 ? fichierMusique : null;
    if (musique && musique.size > TAILLE_MAX_MUSIQUE) throw new ErreurMetier("FICHIER_TROP_GROS");
    let montageBrut: unknown;
    try { montageBrut = JSON.parse(String(form.get("montage") ?? "")); } catch { montageBrut = null; }
    const montage = lireMontage(montageBrut, clips.length, musique ? clips.length : undefined);
    if (!montage) throw new ErreurMetier("MONTAGE_INVALIDE");

    const tampons = await Promise.all(clips.map(async (f) => Buffer.from(await f.arrayBuffer())));
    if (!tampons.every(estVideo)) throw new ErreurMetier("TYPE_NON_AUTORISE");
    if (musique && montage.musique?.cle === "perso") {
      const b = Buffer.from(await musique.arrayBuffer());
      if (!estAudio(b)) throw new ErreurMetier("TYPE_NON_AUTORISE");
      tampons.push(b);
    }
    const total = tampons.reduce((s, b) => s + b.length, 0);
    if (total > TAILLE_MAX_VIDEO) throw new ErreurMetier("FICHIER_TROP_GROS");

    const id = await tx(async (c) => {
      await verifierQuota(c, u.id, total);
      const matiere = await matiereDuFormulaire(form.get("matiere"), c);
      await mkdir(DOSSIER_VIDEOS, { recursive: true, mode: 0o700 });
      for (const b of tampons) {
        const nom = randomBytes(16).toString("hex");
        await writeFile(cheminVideo(nom), b, { mode: 0o600, flag: "wx" });
        ecrits.push(nom);
      }
      const r = await c.query<{ id: number }>(
        `insert into video (auteur, titre, description, subject_id, sources, montage, taille)
         values ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7) returning id`,
        [u.id, titre, description, matiere, ecrits, JSON.stringify(montage), total]);
      return r.rows[0].id;
    });
    traiterFile().catch((err) => console.error("file des vidéos:", err));
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    for (const n of ecrits) await unlink(cheminVideo(n)).catch(() => {});
    if (!(err instanceof ErreurMetier)) console.error("upload vidéo:", err);
    return NextResponse.json({ erreur: messageFr(err) }, { status: 400 });
  }
}
