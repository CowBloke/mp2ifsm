import { carteRendue } from "@/lib/revision";
import { corps, membre } from "../../_api";

export const dynamic = "force-dynamic";

/** `{ paquet: id | null (flash : tous les paquets suivis), exclure: [ids déjà vus] }` → carte ou null. */
export async function POST(request: Request) {
  const b = await corps(request);
  const paquet = b.paquet === null || b.paquet === undefined ? null : Number(b.paquet);
  const exclure = Array.isArray(b.exclure) ? b.exclure.map(Number) : [];
  return membre(async (u) => ({ carte: await carteRendue(u, paquet, exclure) }));
}
