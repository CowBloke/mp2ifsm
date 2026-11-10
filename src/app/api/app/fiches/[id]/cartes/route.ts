import { ajouterCartePour } from "@/lib/cartes";
import { corps, idDe, membre } from "../../../_api";

export const dynamic = "force-dynamic";

/** `{ recto, verso }` → `{ cardId }`. Tout membre peut ajouter une carte. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, b] = await Promise.all([params, corps(request)]);
  return membre((u) => ajouterCartePour(u, idDe(id), b.recto, b.verso));
}
