import { lireProfil, partagerStatsPour } from "@/lib/profil";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

/** Profil, comme `/profil` : portefeuille, paris, relevé, réglages, retours et propositions. */
export async function GET() {
  return membre(lireProfil);
}

/** `{ partageStats: bool }`. */
export async function PATCH(request: Request) {
  const b = await corps(request);
  return membre(async (u) => {
    await partagerStatsPour(u, b.partageStats);
    return { partageStats: b.partageStats };
  });
}
