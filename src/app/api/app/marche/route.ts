import { listerMarches, positionsOuvertes, soldeCentimes } from "@/lib/queries";
import { membre } from "../_api";

export const dynamic = "force-dynamic";

/** Marchés (ouverts d'abord), solde et mises en cours du membre. Montants en centièmes de PCK. */
export async function GET() {
  return membre(async (u) => {
    const [marches, solde, positions] = await Promise.all([
      listerMarches(u.id), soldeCentimes(u.id), positionsOuvertes(u.id),
    ]);
    return { marches, solde, positions };
  });
}
