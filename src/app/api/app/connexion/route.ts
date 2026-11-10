import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { ouvrirSession, verifierIdentifiants } from "@/lib/session";
import { corps, erreur } from "../_api";

export const dynamic = "force-dynamic";

/** Connexion de l'app : même vérification que le site, jeton renvoyé au lieu d'un cookie. */
export async function POST(request: Request) {
  try {
    const b = await corps(request);
    const userId = await verifierIdentifiants(String(b.email ?? "").trim(), String(b.motDePasse ?? ""));
    const { jeton, expire } = await ouvrirSession(userId);
    const utilisateur = await queryOne(
      `select id, display_name, email, role, groupe_colle from app_user where id = $1::uuid`, [userId]);
    return NextResponse.json({ jeton, expire, utilisateur }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return erreur(err);
  }
}
