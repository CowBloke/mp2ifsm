import "server-only";
import { notFound } from "next/navigation";
import { FilVideos } from "@/components/videos/FilVideos";
import { listerMatieres } from "@/lib/matieres";
import type { Utilisateur } from "@/lib/session";
import { listerVideos, mesVideosEnCours, profilVideos, type FiltreVideos } from "@/lib/videos";

/*
 * Fil vertical commun à /divertissement/videos (toute la classe) et
 * /divertissement/videos/[id] (qui commence à une vidéo donnée). Le
 * filtre (?matiere=, ?auteur=) garde le même contexte en défilant.
 */
export async function PageFil({ u, filtre, depart }: { u: Utilisateur; filtre: FiltreVideos; depart?: number }) {
  const [videos, enCours, profil, matieres] = await Promise.all([
    listerVideos(u.id, filtre),
    mesVideosEnCours(u.id),
    filtre.auteur ? profilVideos(filtre.auteur) : null,
    filtre.matiere ? listerMatieres(true) : [],
  ]);
  if (filtre.auteur && !profil) notFound();
  let liste = videos;
  if (depart !== undefined) {
    const i = videos.findIndex((v) => v.id === depart);
    if (i < 0) notFound();
    liste = [...videos.slice(i), ...videos.slice(0, i)];
  }
  const contexte = profil ? `Vidéos de ${profil.pseudo}`
    : filtre.matiere ? matieres.find((m) => m.id === filtre.matiere)?.nom ?? null : null;
  const requete = filtre.auteur ? `?auteur=${filtre.auteur}` : filtre.matiere ? `?matiere=${filtre.matiere}` : "";
  return (
    <FilVideos key={`${requete}-${depart ?? ""}`} videos={liste} moi={u.id} admin={u.role === "admin"} pseudo={u.display_name}
               contexte={contexte} requete={requete} enMontage={enCours.filter((v) => v.statut === "traitement").length}
               retour={profil ? `/divertissement/videos/profil/${profil.id}` : filtre.matiere ? "/divertissement/videos" : "/divertissement"} />
  );
}
