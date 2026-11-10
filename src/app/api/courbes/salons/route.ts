import { creerSalon, salonsOuverts } from "@/lib/courbes/salons";
import { membre } from "../_api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Salons où quelqu'un est présent, pour l'accueil du jeu. */
export function GET() {
  return membre(() => ({ salons: salonsOuverts() }));
}

export function POST() {
  return membre((u) => ({ code: creerSalon(u) }));
}
