import { enregistrerRevision } from "@/lib/revision";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

/** `{ carte, note ("again"|"hard"|"good"|"easy"), jeton, dureeMs? }` : le serveur planifie. */
export async function POST(request: Request) {
  const b = await corps(request);
  return membre((u) => enregistrerRevision(
    u, Number(b.carte), String(b.note ?? ""), String(b.jeton ?? ""),
    typeof b.dureeMs === "number" ? Math.round(b.dureeMs) : undefined,
  ));
}
