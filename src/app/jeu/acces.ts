import "server-only";
import { notFound, redirect } from "next/navigation";
import { utilisateurCourant, type Utilisateur } from "@/lib/session";

/*
 * Accès au jeu : fermé tant que JEU_ACTIF ne l'ouvre pas (« tous » pour
 * les membres, « admins » pour les administrateurs). Le jeu peut ainsi
 * arriver sur main sans être visible.
 */

export function jeuOuvertPour(u: Utilisateur): boolean {
  const acces = process.env.JEU_ACTIF;
  return acces === "tous" || (acces === "admins" && u.role === "admin");
}

/** Pour les pages : 404 si le jeu est fermé, connexion exigée. */
export async function exigerJeu(): Promise<Utilisateur> {
  const acces = process.env.JEU_ACTIF;
  if (acces !== "tous" && acces !== "admins") notFound();
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  if (!jeuOuvertPour(u)) notFound();
  return u;
}

/** URL du serveur de jeu : en production, même origine (via nginx). */
export function urlServeurJeu(): string | null {
  return process.env.JEU_WS_URL || null;
}
