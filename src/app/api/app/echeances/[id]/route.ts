import { corrigerEcheance, retirerEcheance } from "@/lib/echeances";
import { corps, idDe, membre } from "../../_api";

export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ id: string }> };

/** Tout membre corrige une échéance de la classe. */
export async function PATCH(request: Request, { params }: Contexte) {
  const [{ id }, b] = await Promise.all([params, corps(request)]);
  return membre(() => corrigerEcheance(idDe(id), b));
}

/** L'auteur ou un admin la retire. */
export async function DELETE(_request: Request, { params }: Contexte) {
  const { id } = await params;
  return membre((u) => retirerEcheance(u, idDe(id)));
}
