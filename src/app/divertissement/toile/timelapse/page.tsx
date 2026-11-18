import { notFound, redirect } from "next/navigation";
import { Timelapse } from "@/components/place/Timelapse";
import { styleJeu } from "@/components/divertissement/jeux";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timelapse de La Toile — MP2I/FSM" };

/*
 * Timelapse de La Toile : rejoue place_log du premier au dernier pixel.
 * Réservé aux administrateurs pour l'instant (la route d'historique
 * revérifie le rôle).
 */
export default async function PageTimelapse() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  if (u.role !== "admin") notFound();
  return (
    <main className="jeu" style={styleJeu("toile")}>
      <Timelapse />
    </main>
  );
}
