import { modifierCartePour, supprimerCartePour } from "@/lib/cartes";
import { corps, idDe, membre } from "../../_api";

export const dynamic = "force-dynamic";

/** `{ recto, verso, motif? }` : corrige la carte ; l'ancienne version reste dans l'historique. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, b] = await Promise.all([params, corps(request)]);
  return membre((u) => modifierCartePour(u, idDe(id), b.recto, b.verso, b.motif));
}

/** Suppression douce : l'auteur ou un admin. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return membre((u) => supprimerCartePour(u, idDe(id)));
}
