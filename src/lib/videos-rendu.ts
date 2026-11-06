import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { pool } from "./db";
import {
  INTERLIGNE, MUSIQUES, TAILLES_TEXTE, couperTexte, dureeTotale, filtreFfmpeg, hautDuBloc, type Montage,
} from "./videos-montage";

/*
 * Rendu des vidéos éducatives (pas d'import "server-only" : chargé aussi
 * par instrumentation.ts). Une file en base (statut = 'traitement'),
 * une vidéo à la fois, ffmpeg en priorité basse sur 3 cœurs : le Pi
 * reste réactif. Après un redémarrage, la file reprend où elle était.
 */

const RACINE = process.env.STORAGE_ROOT ?? "/home/cowbloke/mp2ifsm-data";
export const DOSSIER_VIDEOS = join(RACINE, "videos");
const DELAI_MAX_MS = 25 * 60_000;
const TENTATIVES_MAX = 3;

export function cheminVideo(nom: string): string {
  if (!/^[a-f0-9]{32}$/.test(nom)) throw new Error("nom de stockage invalide");
  return join(DOSSIER_VIDEOS, nom);
}

function police(): string {
  const candidats = [
    // Même fichier que l'aperçu de l'éditeur (@font-face « Legendes »).
    join(process.cwd(), "public/fonts/DejaVuSans-Bold.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  ];
  return candidats.find((p) => existsSync(p)) ?? candidats[1];
}

function lancer(cmd: string, args: string[], delai = DELAI_MAX_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("nice", ["-n", "10", cmd, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let sortie = "", erreurs = "";
    p.stdout.on("data", (d) => { sortie += d; });
    p.stderr.on("data", (d) => { erreurs = (erreurs + d).slice(-4000); });
    const minuteur = setTimeout(() => p.kill("SIGKILL"), delai);
    p.on("error", (e) => { clearTimeout(minuteur); reject(e); });
    p.on("close", (code) => {
      clearTimeout(minuteur);
      if (code === 0) resolve(sortie);
      else reject(new Error(`${cmd} a échoué (${code}) : ${erreurs.trim().split("\n").slice(-3).join(" | ")}`));
    });
  });
}

/** Le fichier contient-il une piste audio lisible ? */
async function sonderAudio(chemin: string): Promise<boolean> {
  try {
    const json = JSON.parse(await lancer("ffprobe", [
      "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "json", chemin,
    ], 60_000)) as { streams?: unknown[] };
    return (json.streams?.length ?? 0) > 0;
  } catch { return false; }
}

type Sonde = { largeur: number; hauteur: number; audio: boolean; duree: number };

async function sonder(chemin: string): Promise<Sonde> {
  const json = JSON.parse(await lancer("ffprobe", [
    "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration",
    "-of", "json", chemin,
  ], 60_000)) as { streams?: { codec_type: string; width?: number; height?: number }[]; format?: { duration?: string } };
  const v = json.streams?.find((s) => s.codec_type === "video");
  if (!v?.width || !v.height) throw new Error("aucune piste vidéo");
  return {
    largeur: v.width, hauteur: v.height,
    audio: !!json.streams?.some((s) => s.codec_type === "audio"),
    duree: Number(json.format?.duration) || 0,
  };
}

const s3 = (x: number) => Number(x.toFixed(3)).toString();

/** Fichier audio de la musique du montage (bibliothèque ou fichier envoyé). */
export function cheminMusique(m: Montage, sources: string[]): string | null {
  const mu = m.musique;
  if (!mu) return null;
  if (mu.cle === "perso") return mu.source !== undefined && sources[mu.source] ? cheminVideo(sources[mu.source]) : null;
  if (!Object.hasOwn(MUSIQUES, mu.cle)) return null;
  return join(process.cwd(), "public/musique", `${mu.cle}.m4a`);
}

/** Graphe de filtres complet ; exporté pour les tests. */
export function grapheFiltres(
  m: Montage, audio: boolean[], W: number, H: number, fichierTexte: (i: number, j: number) => string, fonte: string,
  musique = false,
): string {
  const parties: string[] = [];
  m.clips.forEach((c, k) => {
    const d = s3(c.fin - c.debut);
    const filtre = filtreFfmpeg(c.filtre ?? "aucun").map((f) => `${f},`).join("");
    parties.push(
      `[${k}:v]setpts=PTS-STARTPTS,trim=start=${s3(c.debut)}:end=${s3(c.fin)},setpts=PTS-STARTPTS,` +
      `fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,${filtre}format=yuv420p,tpad=stop_mode=clone:stop_duration=3,trim=duration=${d},setpts=PTS-STARTPTS[v${k}]`);
    const fmt = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
    parties.push(audio[k] && !c.muet
      ? `[${k}:a]asetpts=PTS-STARTPTS,atrim=start=${s3(c.debut)}:end=${s3(c.fin)},asetpts=PTS-STARTPTS,${fmt},apad,atrim=duration=${d}[a${k}]`
      : `anullsrc=r=48000:cl=stereo,atrim=duration=${d},${fmt}[a${k}]`);
  });
  const sortieSon = musique && m.musique ? "avoix" : "aout";
  parties.push(`${m.clips.map((_, k) => `[v${k}][a${k}]`).join("")}concat=n=${m.clips.length}:v=1:a=1[vc][${sortieSon}]`);
  if (musique && m.musique) {
    // Musique (entrée bouclée) : départ choisi, volume, fondu final, puis mixée aux voix.
    // amix divise chaque entrée par 2 : on remonte de ×2, le limiteur évite la saturation.
    const total = dureeTotale(m);
    const fondu = Math.min(1.5, total / 3);
    const mu = m.musique;
    parties.push(
      `[${m.clips.length}:a]atrim=start=${s3(mu.debut)},asetpts=PTS-STARTPTS,` +
      `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${s3(total)},` +
      `volume=${s3(mu.volume)},afade=t=out:st=${s3(Math.max(0, total - fondu))}:d=${s3(fondu)}[mus]`);
    parties.push(`[avoix]volume=${s3(mu.voix)}[voix]`);
    parties.push(`[voix][mus]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.95[aout]`);
  }

  const chaine = [...filtreFfmpeg(m.filtre)];
  const cote = Math.min(W, H);
  m.textes.forEach((t, i) => {
    const lignes = couperTexte(t.texte, t.taille, W, cote);
    const f = Math.round(cote * TAILLES_TEXTE[t.taille]);
    const pas = f * INTERLIGNE;
    const haut = hautDuBloc(t.position, lignes.length * pas, H);
    lignes.forEach((_, j) => {
      const y = Math.round(haut + j * pas + (pas - f) / 2);
      chaine.push(
        `drawtext=fontfile=${fonte}:textfile=${fichierTexte(i, j)}:expansion=none:fontsize=${f}:fontcolor=white:` +
        `x=(w-text_w)/2:y=${y}:enable='between(t,${s3(t.debut)},${s3(t.fin)})':` +
        (t.fond ? `box=1:boxcolor=black@0.6:boxborderw=${Math.round(f * 0.28)}`
                : `shadowcolor=black@0.7:shadowx=2:shadowy=2:borderw=1:bordercolor=black@0.35`));
    });
  });
  chaine.push("format=yuv420p");
  parties.push(`[vc]${chaine.join(",")}[vout]`);
  return parties.join(";\n");
}

type Ligne = { id: number; sources: string[]; montage: Montage };

export async function rendre(v: Ligne): Promise<{ fichier: string; couverture: string; duree: number; taille: number }> {
  const dir = await mkdtemp(join(tmpdir(), "mp2video-"));
  const sortie = randomBytes(16).toString("hex");
  const poster = randomBytes(16).toString("hex");
  try {
    const m = v.montage;
    const indexMusique = m.musique?.cle === "perso" ? m.musique.source : undefined;
    const sondes = await Promise.all(v.sources.map((s, i) => (i === indexMusique ? null : sonder(cheminVideo(s)))));
    // Musique illisible (fichier sans piste audio) : la vidéo sort sans elle.
    let musique = cheminMusique(m, v.sources);
    if (musique && !(await sonderAudio(musique))) {
      console.error(`vidéo ${v.id} : musique illisible, ignorée`);
      musique = null;
    }
    const sonde = (i: number) => { const x = sondes[i]; if (!x) throw new Error("source invalide"); return x; };
    const premier = sonde(m.clips[0].source);
    const [W, H] = premier.largeur > premier.hauteur ? [1280, 720] : [720, 1280];

    for (const [i, t] of m.textes.entries()) {
      const lignes = couperTexte(t.texte, t.taille, W, Math.min(W, H));
      for (const [j, l] of lignes.entries()) await writeFile(join(dir, `t${i}_${j}.txt`), l);
    }
    const script = join(dir, "graphe.txt");
    await writeFile(script, grapheFiltres(m, m.clips.map((c) => sonde(c.source).audio), W, H,
      (i, j) => join(dir, `t${i}_${j}.txt`), police(), !!musique));

    const entrees = m.clips.flatMap((c) => ["-i", cheminVideo(v.sources[c.source])]);
    // Musique bouclée : elle couvre toute la vidéo même si le morceau est court.
    if (musique) entrees.push("-stream_loop", "-1", "-i", musique);
    await lancer("ffmpeg", [
      "-hide_banner", "-nostdin", "-y", ...entrees,
      "-filter_complex_script", script, "-map", "[vout]", "-map", "[aout]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-maxrate", "3M", "-bufsize", "6M",
      "-threads", "3", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
      "-f", "mp4", cheminVideo(sortie),
    ]);
    const couv = Math.min(m.couverture, Math.max(0, dureeTotale(m) - 0.2));
    await lancer("ffmpeg", [
      "-hide_banner", "-nostdin", "-y", "-ss", s3(couv), "-i", cheminVideo(sortie),
      "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", "-f", "image2", cheminVideo(poster),
    ], 120_000);
    const info = await sonder(cheminVideo(sortie));
    const taille = (await stat(cheminVideo(sortie))).size + (await stat(cheminVideo(poster))).size;
    return { fichier: sortie, couverture: poster, duree: info.duree || dureeTotale(m), taille };
  } catch (err) {
    await unlink(cheminVideo(sortie)).catch(() => {});
    await unlink(cheminVideo(poster)).catch(() => {});
    throw err;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function supprimerSources(sources: string[]) {
  for (const s of sources) await unlink(cheminVideo(s)).catch(() => {});
}

const g = globalThis as unknown as { mp2Rendus?: { enCours: boolean; encore: boolean }; mp2RendusMinuteur?: NodeJS.Timeout };

/** Traite la file jusqu'à ce qu'elle soit vide. Appels concurrents fusionnés. */
export async function traiterFile(): Promise<void> {
  const etat = (g.mp2Rendus ??= { enCours: false, encore: false });
  if (etat.enCours) { etat.encore = true; return; }
  etat.enCours = true;
  try {
    do {
      etat.encore = false;
      while (true) {
        const r = await pool.query<Ligne & { tentatives: number }>(
          `update video set tentatives = tentatives + 1
            where id = (select id from video where statut = 'traitement' order by id limit 1)
            returning id, sources, montage, tentatives`);
        const v = r.rows[0];
        if (!v) break;
        if (v.tentatives > TENTATIVES_MAX) {
          await pool.query(`update video set statut = 'echec', erreur = 'trop de tentatives', sources = '{}', taille = 0 where id = $1`, [v.id]);
          await supprimerSources(v.sources);
          continue;
        }
        try {
          const res = await rendre(v);
          const maj = await pool.query(
            `update video set statut = 'pret', storage_name = $2, poster_name = $3, duree_ms = $4,
                              taille = $5, sources = '{}', erreur = null, pret_at = now()
              where id = $1 and statut = 'traitement'`,
            [v.id, res.fichier, res.couverture, Math.round(res.duree * 1000), res.taille]);
          if (maj.rowCount === 0) {
            // Supprimée pendant le rendu : on ne garde rien.
            await supprimerSources([res.fichier, res.couverture]);
          }
          await supprimerSources(v.sources);
        } catch (err) {
          console.error(`rendu vidéo ${v.id}:`, err);
          const fin = v.tentatives >= TENTATIVES_MAX;
          await pool.query(
            `update video set erreur = $2, statut = case when $3 then 'echec' else statut end,
                              sources = case when $3 then '{}' else sources end,
                              taille = case when $3 then 0 else taille end
              where id = $1`, [v.id, String((err as Error).message).slice(0, 500), fin]);
          if (fin) await supprimerSources(v.sources);
        }
      }
    } while (etat.encore);
  } finally {
    etat.enCours = false;
  }
}

export function demarrerRendus(): void {
  if (g.mp2RendusMinuteur) return;
  const passer = () => { traiterFile().catch((err) => console.error("file des vidéos:", err)); };
  g.mp2RendusMinuteur = setInterval(passer, 120_000);
  g.mp2RendusMinuteur.unref();
  setTimeout(passer, 8_000).unref();
}
