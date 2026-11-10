import { envoyerRetourPour } from "@/lib/profil";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

/** `{ categorie: "idee" | "bug" | "autre", message }` : un retour pour les administrateurs. */
export async function POST(request: Request) {
  const b = await corps(request);
  return membre((u) => envoyerRetourPour(u, b.categorie, b.message, "/app"));
}
