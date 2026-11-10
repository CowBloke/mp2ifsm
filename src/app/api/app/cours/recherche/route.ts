import { DEBUT_EXTRAIT, FIN_EXTRAIT, rechercherCours } from "@/lib/cours";
import { membre } from "../../_api";

export const dynamic = "force-dynamic";

/** Assistant de cours : `?q=` → pages à ouvrir, extraits surlignés entre `debut` et `fin`. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return membre(async () => ({ resultats: await rechercherCours(q), debut: DEBUT_EXTRAIT, fin: FIN_EXTRAIT }));
}
