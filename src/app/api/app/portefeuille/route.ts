import { transfererKcPour } from "@/lib/profil";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

/**
 * `{ sens: "depot" | "retrait", montant: "12", cle: uuid }` : transfert de
 * KC coins avec kcmaths. La clé, tirée par l'app à l'ouverture du
 * formulaire, rend un double envoi sans effet.
 */
export async function POST(request: Request) {
  const b = await corps(request);
  return membre((u) => transfererKcPour(u, b.sens, b.montant, b.cle));
}
