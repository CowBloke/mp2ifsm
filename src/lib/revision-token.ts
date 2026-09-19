import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ErreurMetier } from "./errors";

function signature(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET manquant");
  return createHmac("sha256", secret).update(`revision:${payload}`).digest("base64url");
}
export function jetonRevision(userId: string, cardId: number, reps: number, now: Date) {
  const payload = Buffer.from(JSON.stringify({ userId, cardId, reps, now: now.toISOString() })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifierRevision(token: string, userId: string, cardId: number) {
  try {
    const [payload, sig] = token.split(".");
    const a = Buffer.from(sig ?? ""), b = Buffer.from(signature(payload));
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error();
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    const now = new Date(data.now);
    if (data.userId !== userId || data.cardId !== cardId || !Number.isSafeInteger(data.reps)
        || !Number.isFinite(now.getTime()) || now.getTime() > Date.now()
        || Date.now() - now.getTime() > 2 * 3600_000) throw new Error();
    return { reps: data.reps as number, now };
  } catch { throw new ErreurMetier("REVISION_EXPIREE"); }
}
