import { exigerJeu } from "../acces";
import { EcranJeu } from "../_composants/EcranJeu";

export const dynamic = "force-dynamic";

/** Entraînement : une partie locale contre le mannequin, sans serveur. */
export default async function PageEntrainement() {
  const u = await exigerJeu();
  return <EcranJeu mode="entrainement" pseudo={u.display_name} />;
}
