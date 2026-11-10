import { mettreALaCorbeille } from "@/lib/documents";
import { idDe, membre } from "../../_api";

export const dynamic = "force-dynamic";

/** Mise à la corbeille (30 jours), par le déposant ou un admin. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return membre((u) => mettreALaCorbeille(u, idDe(id)));
}
