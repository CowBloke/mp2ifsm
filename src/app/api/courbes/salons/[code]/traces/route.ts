import { lireTraces } from "@/lib/courbes/salons";
import { codeDe, membre } from "../../../_api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Courbes de la dernière volée, filtrées par le brouillard de ce membre. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = codeDe((await params).code);
  return membre((u) => lireTraces(code, u) ?? { n: 0, traces: [] });
}
