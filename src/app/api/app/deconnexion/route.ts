import { detruireSession } from "@/lib/session";
import { erreur, ok } from "../_api";

export const dynamic = "force-dynamic";

/** Révoque le jeton porteur de la requête. */
export async function POST() {
  try {
    await detruireSession();
    return ok({});
  } catch (err) {
    return erreur(err);
  }
}
