import { lireMessageAccueil } from "@/lib/accueil";
import { prochainesColles } from "@/lib/colles";
import { marchesBientotFermes, resumeFiches } from "@/lib/dashboard";
import { echeancesAVenir } from "@/lib/echeances";
import { listerMatieres } from "@/lib/matieres";
import { toiletVisible } from "@/lib/toilet";
import { membre } from "../_api";

export const dynamic = "force-dynamic";

/** Tout l'accueil en une requête : mêmes sources que la page `/` du site. */
export async function GET() {
  return membre(async (u) => {
    const [message, colles, echeances, matieres, fiches, marches, toilet] = await Promise.all([
      lireMessageAccueil(),
      u.groupe_colle === null ? Promise.resolve([]) : prochainesColles(u.groupe_colle, 8, 7),
      echeancesAVenir(12),
      listerMatieres(),
      resumeFiches(u.id),
      marchesBientotFermes(u.id, 1),
      toiletVisible(u.id),
    ]);
    return {
      utilisateur: { id: u.id, display_name: u.display_name, email: u.email, role: u.role, groupe_colle: u.groupe_colle,
                     // Rubrique cachée : l'app ne montre Toilet! qu'aux membres passés par le lien secret.
                     toilet },
      message,
      colles,
      echeances,
      matieres: matieres.map(({ id, nom, couleur }) => ({ id, nom, couleur })),
      fiches: {
        a_reviser: fiches.a_reviser,
        nouvelles: fiches.nouvelles,
        revises_aujourdhui: fiches.revises_aujourdhui,
        prochain_paquet: fiches.prochain_paquet,
      },
      marche: marches[0] ?? null,
    };
  });
}
