import { exigerJeu, urlServeurJeu } from "./acces";
import { Hub } from "./_composants/Hub";

export const dynamic = "force-dynamic";

/*
 * Jeu de combat de la classe : accueil (entraînement, salons).
 * Fermé tant que JEU_ACTIF ne l'ouvre pas, cf. acces.ts.
 */
export default async function PageJeu() {
  const u = await exigerJeu();
  return <Hub urlJeu={urlServeurJeu()} pseudo={u.display_name} />;
}
