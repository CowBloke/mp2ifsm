import { modifierPaquetPour } from "@/lib/cartes";
import { ErreurMetier } from "@/lib/errors";
import { lirePaquetParId, listerCartes, statsPaquet } from "@/lib/fiches";
import { listerMatieres } from "@/lib/matieres";
import { rendreContenu } from "@/lib/rendu";
import { abonnerPaquet, aimerPaquetPour } from "@/lib/revision";
import { corps, idDe, membre } from "../../_api";

export const dynamic = "force-dynamic";

/**
 * Fiche d'un paquet, comme `/fiches/<slug>` : le paquet, ses cartes (HTML
 * composé par le serveur), les statistiques du membre s'il le suit, et
 * les droits (modifier le paquet ; supprimer une carte).
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return membre(async (u) => {
    const deckId = idDe(id);
    const paquet = await lirePaquetParId(deckId, u.id);
    if (!paquet) throw new ErreurMetier("PAQUET_INTROUVABLE");
    const peutModifier = u.role === "admin" || paquet.created_by === u.id;
    const [cartes, stats, matieres] = await Promise.all([
      listerCartes(deckId, u.id),
      paquet.abonne ? statsPaquet(deckId, u.id) : null,
      peutModifier ? listerMatieres(true) : [],
    ]);
    return {
      paquet,
      peutModifier,
      matieres: matieres.map(({ id, nom, couleur, archivee }) => ({ id, nom, couleur, archivee })),
      stats,
      cartes: cartes.map((c) => ({
        id: c.id, recto: c.recto, verso: c.verso, auteur: c.auteur,
        revisions: c.revisions, signalements: c.signalements, etat: c.etat, due: c.due,
        rectoHtml: rendreContenu(c.recto),
        versoHtml: c.verso.trim() === "(vide)" ? "" : rendreContenu(c.verso),
        peutSupprimer: u.role === "admin" || c.author_id === u.id,
      })),
    };
  });
}

/**
 * `{ suivre: bool }` et/ou `{ aime: bool }` pour ce paquet ;
 * `{ titre, description, matiere }` le modifie (créateur ou admin).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, b] = await Promise.all([params, corps(request)]);
  return membre(async (u) => {
    const deckId = idDe(id);
    const out: { abonne?: boolean; likes?: number; aime?: boolean } = {};
    if ("titre" in b) await modifierPaquetPour(u, deckId, { titre: b.titre, description: b.description, matiere: b.matiere ?? "" });
    if ("suivre" in b) { await abonnerPaquet(u, deckId, b.suivre as boolean); out.abonne = b.suivre as boolean; }
    if ("aime" in b) Object.assign(out, await aimerPaquetPour(u, deckId, b.aime as boolean));
    return out;
  });
}
