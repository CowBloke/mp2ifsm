import { aimerVideoPour, enregistrerVue } from "@/lib/videos";
import { corps, idDe, membre } from "../../_api";

export const dynamic = "force-dynamic";

/** `{ aime: bool }` → compteur à jour ; `{ vue: true }` compte une vue (une par membre). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const [{ id }, b] = await Promise.all([params, corps(request)]);
  return membre(async (u) => {
    const videoId = idDe(id);
    if (b.vue === true) await enregistrerVue(u, videoId);
    return "aime" in b ? aimerVideoPour(u, videoId, b.aime as boolean) : {};
  });
}
