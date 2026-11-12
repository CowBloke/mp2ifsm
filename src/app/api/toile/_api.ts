import { NextResponse } from "next/server";
import { ErreurMetier, messageFr } from "@/lib/errors";
import { utilisateurCourant, type Utilisateur } from "@/lib/session";

/* Socle des routes de La Toile : membre connecté, JSON jamais mis en cache. */

const SANS_CACHE = { "cache-control": "private, no-store" };

export function json(donnees: unknown, status = 200): NextResponse {
  return NextResponse.json(donnees, { status, headers: SANS_CACHE });
}

export async function membre(fn: (u: Utilisateur) => Promise<unknown>): Promise<NextResponse> {
  const u = await utilisateurCourant();
  if (!u) return json({ erreur: "Session expirée, reconnectez-vous" }, 401);
  try {
    return json(await fn(u));
  } catch (err) {
    if (err instanceof ErreurMetier) {
      return json({ erreur: messageFr(err), code: err.code }, err.code === "NON_AUTORISE" ? 403 : 400);
    }
    console.error("la toile :", err);
    return json({ erreur: "Erreur inattendue" }, 500);
  }
}

export async function corps(request: Request): Promise<Record<string, unknown>> {
  try {
    const d = await request.json();
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}
