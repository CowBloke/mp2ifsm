import { NextResponse } from "next/server";
import { ErreurMetier, estErreurAttendue, messageFr } from "@/lib/errors";
import { exigerUtilisateur, type Utilisateur } from "@/lib/session";

/*
 * Socle de l'API de l'app iOS (`/api/app/*`). Les routes ne font que
 * relier HTTP aux fonctions de `src/lib`, celles qu'appellent aussi les
 * actions du site : mêmes validations, mêmes droits, aucune logique ici.
 * Elles n'importent jamais un module "use server" : Next transférerait
 * alors à la route les appels d'action venus des pages.
 *
 * Réponses : 200 + JSON en cas de succès ; sinon `{ erreur }` en français
 * avec 401 (session absente ou expirée : l'app revient à la connexion),
 * 403 (refus) ou 400 (saisie refusée).
 */

function statut(err: unknown): number {
  if (!estErreurAttendue(err)) return 500;
  if (!(err instanceof ErreurMetier)) return 400;     // code métier levé par une fonction SQL
  if (err.code === "NON_CONNECTE") return 401;
  if (err.code === "NON_AUTORISE") return 403;
  if (err.code === "INTROUVABLE") return 404;
  return 400;
}

export function erreur(err: unknown): NextResponse {
  if (!estErreurAttendue(err)) console.error("api app:", err);
  return NextResponse.json({ erreur: messageFr(err) }, {
    status: statut(err), headers: { "cache-control": "private, no-store" },
  });
}

export function ok(donnees: unknown): NextResponse {
  return NextResponse.json(donnees ?? {}, { headers: { "cache-control": "private, no-store" } });
}

/** Exécute `fn` pour un membre connecté et sérialise le résultat. */
export async function membre(fn: (u: Utilisateur) => Promise<unknown>): Promise<NextResponse> {
  try {
    return ok(await fn(await exigerUtilisateur()));
  } catch (err) {
    return erreur(err);
  }
}

/** Corps JSON en objet ; tout autre corps vaut `{}` (les validateurs refusent alors). */
export async function corps(request: Request): Promise<Record<string, unknown>> {
  try {
    const v = await request.json();
    return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function idDe(brut: string): number {
  const n = Number(brut);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ErreurMetier("INTROUVABLE");
  return n;
}
