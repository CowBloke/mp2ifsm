import { ecrirePrefsNotif, lireEtatNotif } from "@/lib/notif-prefs";
import { FLASH_HEURE_MAX, FLASH_HEURE_MIN } from "@/lib/notifications";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

/** Réglages des notifications du membre (mêmes que le Profil du site) et nombre d'appareils. */
export async function GET() {
  return membre(async (u) => ({ ...(await lireEtatNotif(u.id)), heure_min: FLASH_HEURE_MIN, heure_max: FLASH_HEURE_MAX }));
}

/** `{ flash?, flash_heure?, devoirs?, messages? }` : seuls les champs donnés changent. */
export async function PATCH(request: Request) {
  const b = await corps(request);
  return membre((u) => ecrirePrefsNotif(u, {
    flash: b.flash as boolean | undefined, flash_heure: b.flash_heure as number | undefined,
    devoirs: b.devoirs as boolean | undefined, messages: b.messages as boolean | undefined,
  }));
}
