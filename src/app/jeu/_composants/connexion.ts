"use client";

import { useSyncExternalStore } from "react";
import { connecterJeu, type ConnexionJeu, type EtatConnexion } from "@jeu/client";
import { ticketJeu } from "../actions";

/*
 * Une seule connexion au serveur de jeu par onglet, conservée pendant la
 * navigation entre les pages du jeu (accueil → salon → partie). React ne
 * lit que l'état de contrôle (salon, partie, erreurs), jamais le temps réel.
 */

let connexion: ConnexionJeu | null = null;

export function obtenirConnexion(url: string | null): ConnexionJeu {
  if (!connexion || connexion.etat().statut === "ferme" || connexion.etat().statut === "refuse") {
    connexion = connecterJeu({ url, ticket: () => ticketJeu(), auPremierAbonne: true });
  }
  return connexion;
}

export function useEtatConnexion(c: ConnexionJeu): EtatConnexion {
  return useSyncExternalStore(c.abonner, c.etat, c.etat);
}
