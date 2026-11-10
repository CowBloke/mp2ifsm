import { rendreContenu } from "@/lib/rendu";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

const texte = (v: unknown) => (typeof v === "string" ? v.slice(0, 8000) : "");

/**
 * `{ recto, verso }` → HTML composé (KaTeX, images), exactement celui de
 * la révision : l'éditeur montre la carte telle qu'elle sera.
 */
export async function POST(request: Request) {
  const b = await corps(request);
  return membre(async () => ({
    recto: rendreContenu(texte(b.recto)),
    verso: texte(b.verso).trim() === "(vide)" ? "" : rendreContenu(texte(b.verso)),
  }));
}
