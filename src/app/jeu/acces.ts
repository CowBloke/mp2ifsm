import "server-only";
import { redirect } from "next/navigation";
import { utilisateurCourant, type Utilisateur } from "@/lib/session";

/*
 * Accès au jeu : ouvert en permanence à tous les membres connectés.
 */

/** Pour les pages : connexion exigée. */
export async function exigerJeu(): Promise<Utilisateur> {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  return u;
}

/** URL du serveur de jeu : en production, même origine (via nginx). */
export function urlServeurJeu(): string | null {
  return process.env.JEU_WS_URL || null;
}
