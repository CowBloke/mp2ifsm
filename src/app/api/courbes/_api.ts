import { NextResponse } from "next/server";
import { ErreurSalon } from "@/lib/courbes/salons";
import { utilisateurCourant } from "@/lib/session";

/*
 * Socle des routes de Curve Fight : membre connecté exigé, réponses JSON
 * jamais mises en cache, erreurs de jeu renvoyées en français.
 */

const SANS_CACHE = { "cache-control": "private, no-store" };

export function json(donnees: unknown, status = 200): NextResponse {
  return NextResponse.json(donnees, { status, headers: SANS_CACHE });
}

export async function membre(
  fn: (u: { id: string; nom: string }) => Promise<unknown> | unknown,
): Promise<NextResponse> {
  const u = await utilisateurCourant();
  if (!u) return json({ erreur: "Session expirée, reconnectez-vous" }, 401);
  try {
    return json(await fn({ id: u.id, nom: u.display_name }));
  } catch (err) {
    if (err instanceof ErreurSalon) return json({ erreur: err.message }, 400);
    console.error("curve fight :", err);
    return json({ erreur: "Erreur inattendue" }, 500);
  }
}

export const codeDe = (brut: string) => brut.toUpperCase().slice(0, 8);
