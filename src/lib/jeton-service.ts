import "server-only";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/*
 * Routes appelées par une machine (cron, source de contenu) plutôt que
 * par un membre : un jeton partagé dans `Authorization: Bearer`, comparé
 * à temps constant. Renvoie la réponse de refus, ou null si c'est bon.
 */
export function refusJetonService(request: Request, variable: string): NextResponse | null {
  const attendu = process.env[variable];
  if (!attendu) return NextResponse.json({ erreur: `${variable} non configuré` }, { status: 503 });
  const fourni = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(fourni);
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });
  }
  return null;
}
