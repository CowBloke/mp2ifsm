import { ErreurMetier } from "@/lib/errors";
import {
  annulerMembre, bannir, contributeurs, leverDelai, reglerToile, remplirZone, restaurerZone,
} from "@/lib/place/toile";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* GET : tableau de modération (membres ayant joué). Administrateurs seulement. */
export async function GET() {
  return membre(async u => ({ contributeurs: await contributeurs(u) }));
}

/*
 * POST { action, … } : outils de modération. Chaque fonction vérifie le
 * rôle administrateur elle-même.
 */
export async function POST(request: Request) {
  const d = await corps(request);
  return membre(async u => {
    switch (d.action) {
      case "regler":
        await reglerToile(u, { gelee: d.gelee, delai: d.delai });
        return { ok: true };
      case "bannir":
        await bannir(u, d.membre, d.banni === true);
        return { ok: true };
      case "leverDelai":
        await leverDelai(u, d.membre ?? null);
        return { ok: true };
      case "annulerMembre":
        return { ok: true, modifies: await annulerMembre(u, d.membre, d.minutes ?? null) };
      case "remplir":
        return { ok: true, modifies: await remplirZone(u, d.zone, d.couleur) };
      case "restaurer":
        return { ok: true, modifies: await restaurerZone(u, d.zone, d.minutes) };
      default:
        throw new ErreurMetier("PLACE_INVALIDE");
    }
  });
}
