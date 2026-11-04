"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerAdmin } from "./session";
import { notifierMessage } from "./notifications";
import type { Reponse } from "./actions";

/** Remplace le message d'accueil (administrateurs). Vide = retiré. */
export async function modifierMessageAccueil(texte: string, notifier = false): Promise<Reponse<undefined>> {
  try {
    const u = await exigerAdmin();
    const propre = String(texte ?? "").trim();
    if (propre.length > 1000) return { ok: false, erreur: "1000 caractères au maximum" };
    const [ligne] = await query<{ updated_at: Date }>(
      `insert into message_accueil (id, texte, updated_by, updated_at) values (1, $1, $2::uuid, now())
       on conflict (id) do update set texte = excluded.texte, updated_by = excluded.updated_by,
                                      updated_at = now()
       returning updated_at`,
      [propre, u.id],
    );
    revalidatePath("/");
    // Notification facultative ; un échec d'envoi n'annule pas la publication.
    if (notifier === true && propre) {
      notifierMessage(propre, u.id, new Date(ligne.updated_at).toISOString())
        .catch((err) => console.error("notification message:", err));
    }
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ErreurMetier)) console.error(err);
    return { ok: false, erreur: messageFr(err) };
  }
}
