import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const d = await request.json();
    const x = Number(d.x);
    const y = Number(d.y);
    const couleur = Number(d.couleur);
    const pseudo = String(d.pseudo ?? "anonyme").slice(0, 40);

    if (!Number.isInteger(x) || x < 0 || x > 99
        || !Number.isInteger(y) || y < 0 || y > 99
        || !Number.isInteger(couleur) || couleur < 0 || couleur > 17) {
      return NextResponse.json({ erreur: "coordonnées invalides" }, { status: 400 });
    }

    const existing = await query<{ id: string }>(
      `select id from app_user where lower(display_name) = lower($1)`,
      [pseudo]);
    let userId: string;
    if (existing.length === 0) {
      const inserted = await query<{ id: string }>(
        `insert into app_user (email, display_name, password_hash, role, statut)
         values ($1, $2, 'demo', 'member', 'en_attente')
         returning id`,
        [`demo_${Date.now()}@a.bc`, pseudo]);
      userId = inserted[0].id;
    } else {
      userId = existing[0].id;
    }

    const logRow = await query<{ id: number }>(
      `insert into place_log (x, y, couleur, user_id, nature)
       values ($1, $2, $3, $4::uuid, 'pixel') returning id`,
      [x, y, couleur, userId]);
    await query(
      `insert into place_pixel (x, y, couleur, log_id)
       values ($1, $2, $3, $4)
       on conflict (x, y) do update set couleur = excluded.couleur, log_id = excluded.log_id`,
      [x, y, couleur, logRow[0].id]);

    return NextResponse.json({ ok: true, x, y, couleur, pseudo });
  } catch (err) {
    console.error("demo:", err);
    return NextResponse.json({ erreur: "erreur serveur" }, { status: 500 });
  }
}
