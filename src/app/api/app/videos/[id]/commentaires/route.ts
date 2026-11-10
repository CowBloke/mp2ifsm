import { ajouterCommentaire, listerCommentaires } from "@/lib/videos";
import { corps, idDe, membre } from "../../../_api";

export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Contexte) {
  const { id } = await params;
  return membre(async () => ({ commentaires: await listerCommentaires(idDe(id)) }));
}

/** `{ texte }` (500 caractères au plus) → liste à jour. */
export async function POST(request: Request, { params }: Contexte) {
  const [{ id }, b] = await Promise.all([params, corps(request)]);
  return membre(async (u) => ({ commentaires: await ajouterCommentaire(u, idDe(id), b.texte) }));
}
