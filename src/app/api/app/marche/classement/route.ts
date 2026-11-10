import { classement, mouvements, positionsReglees } from "@/lib/queries";
import { membre } from "../../_api";

export const dynamic = "force-dynamic";

/** Classement par performance nette, relevé du portefeuille et paris réglés du membre. */
export async function GET() {
  return membre(async (u) => {
    const [lignes, releve, reglees] = await Promise.all([classement(), mouvements(u.id, 50), positionsReglees(u.id)]);
    return {
      classement: lignes.map(({ user_id, display_name, resultat, paris }) => ({ user_id, display_name, resultat, paris })),
      mouvements: releve,
      reglees,
    };
  });
}
