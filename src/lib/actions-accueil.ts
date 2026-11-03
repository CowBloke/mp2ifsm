"use server";

import { revalidatePath } from "next/cache";
import { query } from "./db";
import { ErreurMetier, messageFr } from "./errors";
import { exigerAdmin } from "./session";
import type { Reponse } from "./actions";

/** Remplace le message d'accueil (administrateurs). Vide = retiré. */
export async function modifierMessageAccueil(texte: string): Promise<Reponse<undefined>> {
  try {
    const u = await exigerAdmin();
    const propre = String(texte ?? "").trim();
    if (propre.length > 1000) return { ok: false, erreur: "1000 caractères au maximum" };
    await query(
      `insert into message_accueil (id, texte, updated_by, updated_at) values (1, $1, $2::uuid, now())
       on conflict (id) do update set texte = excluded.texte, updated_by = excluded.updated_by,
                                      updated_at = now()`,
      [propre, u.id],
    );
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    if (!(err instanceof ErreurMetier)) console.error(err);
    return { ok: false, erreur: messageFr(err) };
  }
}
