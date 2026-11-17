import { attendreChangement, lireToile, poserPixel, versionToile } from "@/lib/place/toile";
import { noterTrace, traceRequete } from "@/lib/traces";
import { corps, membre } from "./_api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
 * GET : état de la toile. Avec ?v=<version connue> à jour, la réponse
 * attend le prochain changement (25 s au plus) : attente longue en guise
 * de temps réel. Sans v (ou v=-1), toute la toile.
 */
export async function GET(request: Request) {
  const brut = new URL(request.url).searchParams.get("v");
  const connue = brut === null ? -1 : Math.trunc(Number(brut));
  const v = Number.isFinite(connue) ? connue : -1;
  return membre(async u => {
    // Première lecture : pose le cookie d'appareil et note la trace.
    if (v < 0) await noterTrace(u.id, await traceRequete());
    if (v >= 0 && v === (await versionToile())) {
      await attendreChangement(25_000, request.signal);
      if (request.signal.aborted) return {};
    }
    return lireToile(u.id, v);
  });
}

/* POST { x, y, couleur, sansDelai? } : pose un pixel. */
export async function POST(request: Request) {
  const d = await corps(request);
  return membre(async u => {
    const trace = await traceRequete();
    await noterTrace(u.id, trace);
    return poserPixel(u, d.x, d.y, d.couleur, d.sansDelai === true, trace.appareil);
  });
}
