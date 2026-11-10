import { listerMatieres } from "@/lib/matieres";
import { lireFiltre, listerVideos, mesVideosEnCours, profilVideos } from "@/lib/videos";
import { membre } from "../_api";

export const dynamic = "force-dynamic";

/*
 * Fil des vidéos prêtes (`?matiere=`, `?auteur=` ; `moi` pour soi), et
 * l'en-tête du profil quand un auteur est demandé ; pour `moi`, aussi les
 * vidéos encore en montage (ou en échec). Les matières servent au filtre
 * et à la publication.
 * Lecture : `/api/videos/<id>` (plages d'octets), couverture `?couverture=1`.
 */
export async function GET(request: Request) {
  return membre(async (u) => {
    const p = new URL(request.url).searchParams;
    const auteur = p.get("auteur") === "moi" ? u.id : p.get("auteur") ?? undefined;
    const filtre = lireFiltre({ matiere: p.get("matiere") ?? undefined, auteur });
    const [videos, profil, enCours, matieres] = await Promise.all([
      listerVideos(u.id, filtre),
      filtre.auteur ? profilVideos(filtre.auteur) : Promise.resolve(null),
      filtre.auteur === u.id ? mesVideosEnCours(u.id) : Promise.resolve([]),
      listerMatieres(),
    ]);
    return { videos, profil, en_cours: enCours, matieres: matieres.map(({ id, nom, couleur }) => ({ id, nom, couleur })) };
  });
}
