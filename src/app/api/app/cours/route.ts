import { catalogue } from "@/lib/cours";
import { membre } from "../_api";

export const dynamic = "force-dynamic";

/** Chapitres, leurs PDF (cours, corrigés, DM) et les paquets proposés avec l'état du membre. */
export async function GET() {
  return membre(async (u) => ({ chapitres: await catalogue(u.id) }));
}
