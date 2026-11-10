import { creerPaquetPour } from "@/lib/cartes";
import { listerPaquets } from "@/lib/fiches";
import { listerMatieres } from "@/lib/matieres";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

/** Tous les paquets avec l'état du membre (suivi, compteurs, j'aime), comme `/fiches`. */
export async function GET() {
  return membre(async (u) => {
    const [paquets, matieres] = await Promise.all([listerPaquets(u.id), listerMatieres()]);
    return { paquets, matieres: matieres.map(({ id, nom, couleur }) => ({ id, nom, couleur })) };
  });
}

/** `{ titre, description?, matiere? }` → `{ id, slug }` ; le créateur suit le paquet. */
export async function POST(request: Request) {
  const b = await corps(request);
  return membre((u) => creerPaquetPour(u, { titre: b.titre, description: b.description, matiere: b.matiere ?? "" }));
}
