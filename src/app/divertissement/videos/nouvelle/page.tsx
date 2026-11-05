import { redirect } from "next/navigation";
import { Studio } from "@/components/videos/Studio";
import { listerMatieres } from "@/lib/matieres";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nouvelle vidéo — MP2I/FSM" };

/* Studio : caméra, montage puis publication, sans quitter l'app. */
export default async function PageNouvelleVideo() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const matieres = await listerMatieres();
  return <Studio matieres={matieres.map((m) => ({ id: m.id, nom: m.nom }))} />;
}
