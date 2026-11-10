import { ErreurMetier } from "@/lib/errors";
import { lireMarche, soldeCentimes } from "@/lib/queries";
import { membre } from "../../_api";

export const dynamic = "force-dynamic";

/** Un marché avec ses issues (mises, parieurs, ma mise) et le solde du membre. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return membre(async (u) => {
    const [marche, solde] = await Promise.all([lireMarche(slug, u.id), soldeCentimes(u.id)]);
    if (!marche) throw new ErreurMetier("MARKET_NOT_FOUND");
    return { marche, solde };
  });
}
