import { documentsDuDossier, rechercherDocuments, usage } from "@/lib/documents";
import { listerDossiers } from "@/lib/dossiers";
import { listerMatieres } from "@/lib/matieres";
import { membre } from "../_api";

export const dynamic = "force-dynamic";

/*
 * `?q=…` : recherche dans tous les documents ; sinon contenu de
 * `?dossier=N` (racine par défaut). Tous les dossiers sont renvoyés à
 * chaque fois (quelques dizaines) : l'app construit l'arbre elle-même.
 * Téléchargement : `/api/documents/<id>` ; envoi : `/api/documents/upload`.
 */
export async function GET(request: Request) {
  return membre(async (u) => {
    const p = new URL(request.url).searchParams;
    const q = (p.get("q") ?? "").trim();
    const dossier = Number(p.get("dossier"));
    const [dossiers, documents, occupation, matieres] = await Promise.all([
      listerDossiers("document"),
      q ? rechercherDocuments(q) : documentsDuDossier(Number.isSafeInteger(dossier) && dossier > 0 ? dossier : null),
      usage(u.id),
      listerMatieres(),
    ]);
    return {
      dossiers: dossiers.map(({ id, parent_id, nom, couleur, matiere, subject_id, nb_elements }) =>
        ({ id, parent_id, nom, couleur, matiere, subject_id, nb_elements })),
      documents: documents.map((d) => ({
        ...d,
        peut_supprimer: u.role === "admin" || d.uploaded_by === u.id,
      })),
      usage: occupation,
      matieres: matieres.map(({ id, nom, couleur }) => ({ id, nom, couleur })),
    };
  });
}
