import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { inscrireMembre, ouvrirSession } from "@/lib/session";
import { corps, erreur } from "../_api";

export const dynamic = "force-dynamic";

/** Inscription depuis l'app (code d'invitation de la classe) ; renvoie un jeton comme la connexion. */
export async function POST(request: Request) {
  try {
    const b = await corps(request);
    const userId = await inscrireMembre({ email: b.email, pseudo: b.pseudo, motDePasse: b.motDePasse, code: b.code });
    const { jeton, expire } = await ouvrirSession(userId);
    const utilisateur = await queryOne(
      `select id, display_name, email, role, groupe_colle from app_user where id = $1::uuid`, [userId]);
    return NextResponse.json({ jeton, expire, utilisateur }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return erreur(err);
  }
}
