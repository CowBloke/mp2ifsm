import { parier } from "@/lib/paris";
import { corps, membre } from "../../_api";

export const dynamic = "force-dynamic";

/** `{ issue, montant ("1,50"), cle (UUID choisi à l'ouverture de la feuille) }` → solde à jour. */
export async function POST(request: Request) {
  const b = await corps(request);
  return membre(async (u) => {
    const { slug: _, ...r } = await parier(u, Number(b.issue), String(b.montant ?? ""), String(b.cle ?? ""));
    return r;
  });
}
