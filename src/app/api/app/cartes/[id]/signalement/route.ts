import { signalerCartePour } from "@/lib/cartes";
import { corps, idDe, membre } from "../../../_api";

export const dynamic = "force-dynamic";

/** `{ motif }` : signale une erreur dans la carte (un signalement par membre). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, b] = await Promise.all([params, corps(request)]);
  return membre((u) => signalerCartePour(u, idDe(id), b.motif));
}
