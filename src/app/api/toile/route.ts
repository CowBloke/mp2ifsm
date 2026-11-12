import { attendreChangement, lireToile, poserPixel, versionToile } from "@/lib/place/toile";
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
  return membre(u => poserPixel(u, d.x, d.y, d.couleur, d.sansDelai === true));
}
