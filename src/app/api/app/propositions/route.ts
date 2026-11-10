import { proposerPariPour } from "@/lib/profil";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

/** `{ question, description, closesAt (ISO), issues: [..] }` : proposition de pari, examinée par un admin. */
export async function POST(request: Request) {
  const b = await corps(request);
  return membre((u) => proposerPariPour(u, b));
}
