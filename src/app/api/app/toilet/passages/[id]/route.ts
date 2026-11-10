import { supprimerPassagePour } from "@/lib/toilet";
import { idDe, membre } from "../../../_api";

export const dynamic = "force-dynamic";

/** Retire un passage : son auteur ou un admin. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return membre((u) => supprimerPassagePour(u, idDe(id)));
}
