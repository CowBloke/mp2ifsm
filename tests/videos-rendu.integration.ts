/*
 * Rendu ffmpeg réel sur trois clips synthétiques (WebM VP8/Opus portrait,
 * WebM sans son en paysage, MP4). Les clips sont dans
 * $STORAGE_ROOT/videos/{a×32, b×32, c×32} :
 *   STORAGE_ROOT=/chemin node --import tsx tests/videos-rendu.integration.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rendre, cheminVideo } from "../src/lib/videos-rendu";
import { lireMontage } from "../src/lib/videos-montage";

const montage = lireMontage({
  clips: [
    { source: 0, debut: 0.5, fin: 3.5, muet: false },
    { source: 1, debut: 0, fin: 2, muet: false },
    { source: 2, debut: 1, fin: 2.8, muet: true },
    { source: 0, debut: 4, fin: 5.5, muet: false },
  ],
  filtre: "tableau",
  textes: [
    { texte: "Théorème de Rolle : f(a) = f(b) ⇒ ∃c, f'(c) = 0 — l'idée %{n} \\ : ,", debut: 0, fin: 3, position: "bas", taille: "m", fond: true },
    { texte: "Titre", debut: 2, fin: 6, position: "haut", taille: "l", fond: false },
  ],
  couverture: 1,
}, 3);
assert.ok(montage);
const t0 = Date.now();
const r = await rendre({ id: 1, sources: ["a".repeat(32), "b".repeat(32), "c".repeat(32)], montage });
const info = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries",
  "stream=codec_type,codec_name,width,height:format=duration", "-of", "json", cheminVideo(r.fichier)]).toString());
console.log(JSON.stringify(info), `${Date.now() - t0} ms`, r);
assert.equal(info.streams[0].width, 720);
assert.equal(info.streams[0].height, 1280);
assert.ok(Math.abs(Number(info.format.duration) - 8.3) < 0.3, `durée ${info.format.duration}`);
console.log("ok", cheminVideo(r.fichier), cheminVideo(r.couverture));
