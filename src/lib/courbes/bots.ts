/*
 * Curve Fight : les bots. Un bot essaie quelques courbes simples
 * (droite, parabole, sinusoïde) vers ses adversaires, les simule comme
 * le ferait le serveur et garde la première qui touche. Il vise parfois
 * à côté : il doit rester battable.
 */
import { ErreurExpression, verifier, type Contraintes, type Expression } from "./expression";
import { simuler, type Tireur } from "./simulation";
import type { Cercle } from "./monde";

const nb = (v: number) => String(Number(v.toFixed(3)));
/** « (x-3) », « (x+12) », ou « x » si le bot est en x = 0. */
const centre = (x0: number) => (x0 === 0 ? "x" : `(x${x0 > 0 ? "-" : "+"}${nb(Math.abs(x0))})`);
const terme = (v: number, reste: string) => `${v < 0 ? "-" : "+"}${nb(Math.abs(v))}${reste}`;

function candidats(
  moi: Tireur, cible: Tireur, rnd: () => number, regles: Contraintes,
): string[] {
  const dx = cible.x - moi.x, dy = cible.y - moi.y;
  if (Math.abs(dx) < 0.5) return [];
  const u = centre(moi.x);
  const liste: string[] = [];
  const eq = regles.equadiff;

  const pente = dy / dx;
  liste.push(eq ? nb(pente) : `${nb(pente)}x`);

  for (let k = 0; k < 3; k++) {
    const a = (rnd() < 0.5 ? -1 : 1) * (0.01 + rnd() * 0.07);
    const m = (dy - a * dx * dx) / dx;
    liste.push(eq ? `${nb(2 * a)}${u}${terme(m, "")}` : `${nb(a)}${u}^2${terme(m, u)}`);
  }

  if (regles.familles.includes("trigo")) {
    for (let k = 0; k < 2; k++) {
      const amp = 1 + rnd() * 3, w = 0.25 + rnd() * 0.6;
      const m = (dy - amp * Math.sin(w * dx)) / dx;
      liste.push(eq
        ? `${nb(amp * w)}cos(${nb(w)}${u})${terme(m, "")}`
        : `${nb(amp)}sin(${nb(w)}${u})${terme(m, u)}`);
    }
  }
  return liste;
}

export function choisirTir(
  moi: Tireur, autres: Tireur[], obstacles: Cercle[], crateres: Cercle[],
  regles: Contraintes, rnd: () => number,
): Expression | null {
  // Trois cibles au plus : chaque essai coûte une simulation.
  const cibles = [...autres].sort(() => rnd() - 0.5).slice(0, 3);
  const tir = regles.equadiff ? "equadiff" : "fonction";
  // Une fois sur deux le bot s'applique ; sinon il vise à la louche.
  const applique = rnd() < 0.5;
  const valides: Expression[] = [];

  for (const cible of cibles) {
    const visee = applique ? cible
      : { ...cible, x: cible.x + (rnd() * 2 - 1) * 2.5, y: cible.y + (rnd() < 0.5 ? -1 : 1) * (1.2 + rnd() * 2.5) };
    for (const source of candidats(moi, visee, rnd, regles)) {
      let expr: Expression;
      try { expr = verifier(source, regles); } catch (err) {
        if (err instanceof ErreurExpression) continue;
        throw err;
      }
      valides.push(expr);
      if (!applique) continue;
      const essai = simuler(
        [{ ...moi, expr }, ...autres.map((a) => ({ ...a, expr: null }))], obstacles, crateres, tir);
      if (essai.evenements.some((e) => e.type === "elimination")) return expr;
    }
    if (!applique && valides.length) break;
  }
  return valides.length ? valides[Math.floor(rnd() * valides.length)] : null;
}
