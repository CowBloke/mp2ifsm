import { retirerCommentaire } from "@/lib/videos";
import { idDe, membre } from "../../_api";

export const dynamic = "force-dynamic";

/** Par son auteur, l'auteur de la vidéo ou un admin → commentaires restants de la vidéo. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return membre(async (u) => ({ commentaires: await retirerCommentaire(u, idDe(id)) }));
}
