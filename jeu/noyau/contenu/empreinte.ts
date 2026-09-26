import { fnv1a } from "../hachage";
import { REGLAGES_STANDARD } from "../regles";
import { STATUTS } from "../statuts";
import { CARTES, TOUS_LES_PERSOS } from "./index";

/*
 * Empreinte des données du jeu : personnages, cartes, statuts, règles.
 *
 * Le navigateur l'envoie en se connectant ; le serveur refuse une
 * empreinte différente (« rechargez la page »). Sans cela, un onglet
 * resté ouvert pendant une mise à jour recevrait un personnage qu'il ne
 * connaît pas, ou prédirait avec des dégâts périmés. Elle change toute
 * seule dès qu'une donnée change ; une modification du moteur lui-même
 * (règles codées, format de l'état) demande, elle, d'augmenter
 * VERSION_PROTOCOLE.
 */
export const EMPREINTE_CONTENU: string = fnv1a(JSON.stringify({
  persos: TOUS_LES_PERSOS, cartes: CARTES, statuts: STATUTS, reglages: REGLAGES_STANDARD,
})).toString(16).padStart(8, "0");
