import { historiqueCarte } from "@/lib/fiches";
import { rendreContenu } from "@/lib/rendu";
import { idDe, membre } from "../../../_api";

export const dynamic = "force-dynamic";

/** Versions successives d'une carte, la plus récente d'abord. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return membre(async () => {
    const lignes = await historiqueCarte(idDe(id));
    return {
      versions: lignes.map((r) => ({
        id: r.id, auteur: r.auteur, editedAt: r.edited_at, motif: r.motif,
        rectoHtml: rendreContenu(r.recto),
        versoHtml: r.verso.trim() === "(vide)" ? "" : rendreContenu(r.verso),
      })),
    };
  });
}
