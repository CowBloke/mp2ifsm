import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { synchroniserDepots } from "@/lib/external";
import { purgerDocuments } from "@/lib/purge";
import { purgerSessions } from "@/lib/session";

export const dynamic = "force-dynamic";

/*
 * Tirage periodique des depots, appele par cron sur le Pi :
 *   curl -fsS -H "authorization: Bearer $CRON_TOKEN" \
 *        http://127.0.0.1:4260/api/cron/sync-deposits
 *
 * Protege par un jeton partage : cette route n'est pas derriere la
 * session utilisateur.
 */
export async function POST(request: Request) {
  const attendu = process.env.CRON_TOKEN;
  if (!attendu) {
    return NextResponse.json({ erreur: "CRON_TOKEN non configuré" }, { status: 503 });
  }

  const fourni = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(fourni);
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ erreur: "non autorisé" }, { status: 401 });
  }

  try {
    const purge = await purgerDocuments();
    const resultat = await synchroniserDepots();
    await purgerSessions();
    return NextResponse.json({ ...resultat, purge });
  } catch (err) {
    console.error("sync-deposits:", err);
    return NextResponse.json({ erreur: "échec du tirage" }, { status: 502 });
  }
}

export const GET = POST;
