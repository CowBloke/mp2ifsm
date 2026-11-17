import { ErreurMetier } from "@/lib/errors";
import { inscrireMembre } from "@/lib/session";
import { noterTrace, traceRequete } from "@/lib/traces";
import { corps, erreur } from "../_api";

export const dynamic = "force-dynamic";

/*
 * Inscription depuis l'app (code d'invitation de la classe). Le compte est
 * créé en attente de validation par un administrateur : pas de jeton,
 * l'app affiche le message et revient à la connexion.
 */
export async function POST(request: Request) {
  try {
    const b = await corps(request);
    const trace = await traceRequete();
    const userId = await inscrireMembre({ email: b.email, pseudo: b.pseudo, motDePasse: b.motDePasse, code: b.code }, trace);
    await noterTrace(userId, trace);
    throw new ErreurMetier("INSCRIPTION_EN_ATTENTE");
  } catch (err) {
    return erreur(err);
  }
}
