import type { Point, Visage } from "./moteur";

/* Indices des points MediaPipe Face Mesh. */
export const OEIL_G = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const OEIL_D = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
export const BOUCHE = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
export const NEZ = [1, 2, 98, 327, 168, 6, 197, 195, 5, 4, 129, 358, 49, 279, 64, 294];
export const OVALE = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
export const IRIS_G = 468;
export const IRIS_D = 473;
export const FRONT = 10;
export const MENTON = 152;

export type Boite = { cx: number; cy: number; w: number; h: number };

/** Boîte englobante d'une région, agrandie de `marge` (fraction). */
export function boite(v: Visage, indices: number[], marge = 0.3): Boite {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of indices) {
    const p = v.pts[i];
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  const w = (x1 - x0) * (1 + marge), h = (y1 - y0) * (1 + marge);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(8, w), h: Math.max(8, h) };
}

export const milieu = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const lisser = (actuel: number, cible: number, dt: number, vitesse = 10) => actuel + (cible - actuel) * Math.min(1, dt * vitesse);
export const hasard = <T,>(l: readonly T[]): T => l[Math.floor(Math.random() * l.length)];
/** Tire un élément différent du précédent. */
export function autre<T>(l: readonly T[], avant: T | null): T {
  if (l.length < 2) return l[0];
  let x = hasard(l);
  while (x === avant) x = hasard(l);
  return x;
}

const reserve = new Map<string, HTMLCanvasElement>();
function toile(cle: string, w: number, h: number): HTMLCanvasElement {
  let c = reserve.get(cle);
  if (!c) { c = document.createElement("canvas"); reserve.set(cle, c); }
  const W = Math.ceil(w), H = Math.ceil(h);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  return c;
}

/**
 * Découpe une région du cadre en ellipse aux bords fondus, prête à être
 * recollée ailleurs (agrandie, tournée, retournée…).
 */
export function morceau(cadre: HTMLCanvasElement, b: Boite, cle: string, fondu = 0.35): HTMLCanvasElement {
  const c = toile(cle, b.w, b.h);
  const x = c.getContext("2d")!;
  x.globalCompositeOperation = "source-over";
  x.clearRect(0, 0, c.width, c.height);
  x.drawImage(cadre, b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h, 0, 0, c.width, c.height);
  x.globalCompositeOperation = "destination-in";
  x.save();
  x.translate(c.width / 2, c.height / 2);
  x.scale(c.width / 2, c.height / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, "#000");
  g.addColorStop(1 - fondu, "#000");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(-1, -1, 2, 2);
  x.restore();
  x.globalCompositeOperation = "source-over";
  return c;
}

/** Colle un morceau centré en (x, y), mis à l'échelle et tourné. */
export function coller(ctx: CanvasRenderingContext2D, m: HTMLCanvasElement, x: number, y: number, echelle: number, angle = 0, retourne = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(echelle, retourne ? -echelle : echelle);
  ctx.drawImage(m, -m.width / 2, -m.height / 2);
  ctx.restore();
}

/** Grossit une région sur place (gros nez, grosse tête…). */
export function grossir(ctx: CanvasRenderingContext2D, cadre: HTMLCanvasElement, b: Boite, cle: string, k: number, ancre: Point | null = null, fondu = 0.35) {
  const m = morceau(cadre, b, cle, fondu);
  const a = ancre ?? { x: b.cx, y: b.cy };
  // Le morceau grossit autour de l'ancre (ex. : le menton pour une grosse tête).
  const cx = a.x + (b.cx - a.x) * k, cy = a.y + (b.cy - a.y) * k;
  coller(ctx, m, cx, cy, k);
}

/* --- Texte ------------------------------------------------------------ */

export const POLICE = `"Legendes", "DejaVu Sans", system-ui, sans-serif`;

/** Coupe un texte en lignes qui tiennent dans `largeur`. */
export function lignes(ctx: CanvasRenderingContext2D, texte: string, largeur: number): string[] {
  const out: string[] = [];
  for (const para of texte.split("\n")) {
    let l = "";
    for (const mot of para.split(" ")) {
      const essai = l ? `${l} ${mot}` : mot;
      if (ctx.measureText(essai).width > largeur && l) { out.push(l); l = mot; } else l = essai;
    }
    out.push(l);
  }
  return out;
}

/** Texte façon mème : blanc, contour noir épais. */
export function texteMeme(ctx: CanvasRenderingContext2D, texte: string, x: number, y: number, taille: number, largeur: number,
  options: { couleur?: string; contour?: string; align?: CanvasTextAlign; base?: CanvasTextBaseline } = {}) {
  ctx.save();
  ctx.font = `700 ${taille}px ${POLICE}`;
  ctx.textAlign = options.align ?? "center";
  ctx.textBaseline = options.base ?? "top";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, taille * 0.16);
  ctx.strokeStyle = options.contour ?? "#000";
  ctx.fillStyle = options.couleur ?? "#fff";
  const ls = lignes(ctx, texte, largeur);
  const pas = taille * 1.18;
  const y0 = options.base === "bottom" ? y - (ls.length - 1) * pas : y;
  ls.forEach((l, i) => { ctx.strokeText(l, x, y0 + i * pas); ctx.fillText(l, x, y0 + i * pas); });
  ctx.restore();
  return ls.length * pas;
}

export function rectArrondi(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Bulle de pensée (nuage + petites bulles vers la tête). */
export function bullePensee(ctx: CanvasRenderingContext2D, texte: string, x: number, y: number, largeur: number, taille: number, vers: Point, hautMin = 0) {
  ctx.save();
  ctx.font = `700 ${taille}px ${POLICE}`;
  const ls = lignes(ctx, texte, largeur - taille * 1.4);
  const w = Math.min(largeur, Math.max(...ls.map((l) => ctx.measureText(l).width)) + taille * 1.6);
  const h = ls.length * taille * 1.25 + taille * 1.2;
  const x0 = x - w / 2, y0 = Math.max(hautMin + taille, y - h);
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = taille * 0.6;
  // Nuage : un rectangle arrondi bordé de cercles.
  rectArrondi(ctx, x0, y0, w, h, taille * 0.9);
  ctx.fill();
  const n = Math.max(4, Math.round(w / (taille * 1.3)));
  for (let i = 0; i <= n; i++) {
    const px = x0 + (w * i) / n;
    ctx.beginPath(); ctx.arc(px, y0 + taille * 0.15, taille * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px, y0 + h - taille * 0.15, taille * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  // Petites bulles vers la tête.
  for (let i = 1; i <= 3; i++) {
    const k = i / 4;
    ctx.beginPath();
    const yb = y0 + h;
    ctx.arc(x + (vers.x - x) * k, yb + (vers.y - yb) * k, taille * (0.55 - i * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#111";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ls.forEach((l, i) => ctx.fillText(l, x, y0 + taille * 0.6 + i * taille * 1.25));
  ctx.restore();
}

/** Fond vignette (assombrit les bords), d'opacité `k`. */
export function vignette(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, couleur = "0,0,0") {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
  g.addColorStop(0, `rgba(${couleur},0)`);
  g.addColorStop(1, `rgba(${couleur},${k})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** Dessine le cadre avec un zoom `k` centré sur `c` (et un décalage de tremblement). */
export function zoomer(ctx: CanvasRenderingContext2D, cadre: HTMLCanvasElement, W: number, H: number, c: Point, k: number, dx = 0, dy = 0, filtre = "none") {
  const sw = W / k, sh = H / k;
  const sx = Math.max(0, Math.min(W - sw, c.x - sw / 2)), sy = Math.max(0, Math.min(H - sh, c.y - sh / 2));
  ctx.save();
  ctx.filter = filtre;
  ctx.drawImage(cadre, sx, sy, sw, sh, dx, dy, W, H);
  ctx.restore();
  return { sx, sy, k };
}

/** Machine à écrire : la part du texte visible après `t` secondes. */
export function tape(texte: string, t: number, vitesse = 28): string {
  return texte.slice(0, Math.max(0, Math.floor(t * vitesse)));
}
