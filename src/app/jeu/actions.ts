"use server";

import { DUREE_TICKET_MS, signerTicket } from "@jeu/protocole/ticket";
import { exigerUtilisateur } from "@/lib/session";
import { jeuOuvertPour } from "./acces";

/*
 * Ticket de jeu : le site, qui connaît la session, atteste l'identité du
 * joueur auprès du serveur de jeu. Signé avec le secret de session (et
 * un préfixe propre au jeu), valable deux minutes, redemandé à chaque
 * connexion.
 */
export async function ticketJeu(): Promise<string> {
  const u = await exigerUtilisateur();
  if (!jeuOuvertPour(u)) throw new Error("Jeu fermé.");
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET manquant");
  return signerTicket({ uid: u.id, nom: u.display_name, role: u.role, exp: Date.now() + DUREE_TICKET_MS }, secret);
}
