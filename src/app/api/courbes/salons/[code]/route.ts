import { agir, attendre, lireSalon, versionSalon, type Action } from "@/lib/courbes/salons";
import { codeDe, membre } from "../../_api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Contexte = { params: Promise<{ code: string }> };

/*
 * État du salon vu par ce membre. Avec ?v=<version connue>, la réponse
 * attend le prochain changement (15 s au plus) : c'est l'attente longue
 * qui tient lieu de temps réel.
 */
export async function GET(request: Request, { params }: Contexte) {
  const code = codeDe((await params).code);
  const connue = Number(new URL(request.url).searchParams.get("v"));
  return membre(async (u) => {
    const etat = lireSalon(code, u);
    if (etat.v !== connue) return etat;
    await attendre(code, versionSalon(code) ?? -1, 15_000, request.signal);
    // Navigateur parti pendant l'attente : ne pas le faire rentrer dans le salon.
    if (request.signal.aborted) return {};
    return lireSalon(code, u);
  });
}

export async function POST(request: Request, { params }: Contexte) {
  const code = codeDe((await params).code);
  let action: Action;
  try {
    action = await request.json();
  } catch {
    action = { t: "annuler" };
  }
  return membre((u) => ({ etat: agir(code, u, action) }));
}
