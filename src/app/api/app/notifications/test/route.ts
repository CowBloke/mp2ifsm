import { envoyerAuMembre } from "@/lib/notifications";
import { membre } from "../../_api";

export const dynamic = "force-dynamic";

/** Notification d'essai sur tous les appareils du membre → nombre d'envois réussis. */
export async function POST() {
  return membre(async (u) => ({
    appareils: await envoyerAuMembre(u.id, {
      titre: "Notifications activées", corps: "Les notifications mp2ifsm arrivent bien sur ce téléphone.",
      url: "/profil", tag: "test",
    }),
  }));
}
