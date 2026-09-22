import { notFound, redirect } from "next/navigation";
import { utilisateurCourant } from "@/lib/session";
import { EcranJeu } from "./_composants/EcranJeu";

export const dynamic = "force-dynamic";

/*
 * Jeu de combat de la classe — prototype.
 *
 * Fermé tant que JEU_ACTIF ne l'ouvre pas : « tous » pour les membres,
 * « admins » pour les administrateurs, sinon la page n'existe pas. Le
 * jeu peut donc arriver sur main sans être visible.
 */
export default async function PageJeu() {
  const acces = process.env.JEU_ACTIF;
  if (acces !== "tous" && acces !== "admins") notFound();

  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  if (acces === "admins" && u.role !== "admin") notFound();

  return <EcranJeu />;
}
