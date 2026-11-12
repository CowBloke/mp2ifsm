import { infoPixel } from "@/lib/place/toile";
import { membre } from "../_api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* GET ?x=&y= : couleur, auteur et date du pixel. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  return membre(() => infoPixel(Number(p.get("x")), Number(p.get("y"))));
}
