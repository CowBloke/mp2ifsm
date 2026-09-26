import { exigerJeu } from "../acces";
import { Entrainement } from "../_composants/Entrainement";

export const dynamic = "force-dynamic";

/** Entraînement : une partie locale contre le mannequin ou des bots, sans serveur. */
export default async function PageEntrainement() {
  const u = await exigerJeu();
  return <Entrainement pseudo={u.display_name} />;
}
