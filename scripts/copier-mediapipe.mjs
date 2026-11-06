/*
 * Copie le moteur WebAssembly de MediaPipe (lentilles de la caméra) dans
 * public/lentilles/wasm : servi par le site lui-même, la CSP n'autorise
 * aucune origine tierce. Lancé avant `next build` et `next dev`.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const source = join(process.cwd(), "node_modules/@mediapipe/tasks-vision/wasm");
const cible = join(process.cwd(), "public/lentilles/wasm");
if (!existsSync(source)) {
  console.warn("copier-mediapipe : @mediapipe/tasks-vision absent, lentilles indisponibles");
  process.exit(0);
}
mkdirSync(cible, { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  cpSync(join(source, f), join(cible, f));
}
console.log("copier-mediapipe : moteur copié dans public/lentilles/wasm");
