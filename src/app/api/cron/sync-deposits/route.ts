import { NextResponse } from "next/server";
import { refusJetonService } from "@/lib/jeton-service";
import { reprendreTransferts } from "@/lib/kcmaths";
import { purgerDocuments } from "@/lib/purge";
import { purgerSessions } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * Reprise des transferts kcmaths restes en attente, appelee par cron
 * sur le Pi :
 *   curl -fsS -H "authorization: Bearer $CRON_TOKEN" \
 *        http://127.0.0.1:4260/api/cron/sync-deposits
 *
 * Protege par un jeton partage : cette route n'est pas derriere la
 * session utilisateur.
 */
export async function POST(request: Request) {
  const refus = refusJetonService(request, "CRON_TOKEN");
  if (refus) return refus;

  try {
    const purge = await purgerDocuments();
    const resultat = await reprendreTransferts();
    await purgerSessions();
    return NextResponse.json({ ...resultat, purge });
  } catch (err) {
    console.error("sync-deposits:", err);
    return NextResponse.json({ erreur: "échec de la reprise" }, { status: 502 });
  }
}

export const GET = POST;
