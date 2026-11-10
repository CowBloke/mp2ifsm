import { creerEcheance } from "@/lib/echeances";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

/** `{ titre, matiere ("" ou id), dueAt (ISO 8601), details? }` */
export async function POST(request: Request) {
  const b = await corps(request);
  return membre((u) => creerEcheance(u, b));
}
