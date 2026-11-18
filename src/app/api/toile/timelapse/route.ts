import { historiqueToile } from "@/lib/place/toile";
import { membre } from "../_api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* GET : historique complet de la toile pour le timelapse. Administrateurs seulement. */
export async function GET() {
  return membre(u => historiqueToile(u));
}
