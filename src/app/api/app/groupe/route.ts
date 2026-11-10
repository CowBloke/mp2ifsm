import { enregistrerGroupe } from "@/lib/colles";
import { corps, membre } from "../_api";

export const dynamic = "force-dynamic";

/** `{ groupe: N }`, ou `{ groupe: null }` pour le retirer. */
export async function PUT(request: Request) {
  const b = await corps(request);
  const groupe = b.groupe === null ? null : Number(b.groupe);
  return membre(async (u) => {
    await enregistrerGroupe(u, groupe);
    return { groupe };
  });
}
