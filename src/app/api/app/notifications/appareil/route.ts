import { enregistrerAppareilIos, retirerAppareilIos } from "@/lib/notif-prefs";
import { corps, membre } from "../../_api";

export const dynamic = "force-dynamic";

/** `{ jeton (APNs, hexadécimal), environnement: "sandbox" | "production" }` */
export async function PUT(request: Request) {
  const b = await corps(request);
  return membre((u) => enregistrerAppareilIos(u, b.jeton, b.environnement));
}

/** `{ jeton }` : à la déconnexion, ce téléphone ne reçoit plus rien pour ce compte. */
export async function DELETE(request: Request) {
  const b = await corps(request);
  return membre((u) => retirerAppareilIos(u, b.jeton));
}
