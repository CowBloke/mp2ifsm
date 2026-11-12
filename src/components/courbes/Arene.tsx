"use client";

import { useEffect, useRef } from "react";
import { compiler, lire } from "@/lib/courbes/expression";
import { PAS, RAYON_JOUEUR, VITESSE, VUE_DEPART, VUE_TRACE, X_MAX, Y_MAX } from "@/lib/courbes/monde";
import { FINESSE, affiner, echantillonner, ecrireNombre, graduation } from "@/lib/courbes/trace";
import type { VueEvenement, VueSalon, VueTrace, VueTraces } from "@/lib/courbes/vue";

/** Courbe du brouillon, calculée par le navigateur avec la simulation du serveur. */
export type Apercu = {
  f: (x: number, y: number) => number;
  equadiff: boolean;
  /** Les deux branches du tir, un point par tick. */
  branches: number[][];
};

type Props = {
  etat: VueSalon;
  traces: VueTraces | null;
  apercu: Apercu | null;
  /** Horloge du serveur, en ms. */
  horloge: () => number;
  surEvenement?: (e: VueEvenement) => void;
  children?: React.ReactNode;
};

type Onde = { x: number; y: number; vie: number; duree: number; couleur: string; portee: number };
type Theme = { papier: string; dehors: string; encre: string; gris: string; joueurs: string[] };
type Fine = { tr: VueTrace; pts: number[]; finesse: number };

const TAU = 2 * Math.PI;
const borner = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/*
 * Le repère : une feuille de calculatrice graphique. On s'y déplace à la
 * souris ou au doigt, on zoome à la molette ou en pinçant. Le serveur a
 * déjà calculé la volée ; ici on la rejoue au rythme de son horloge, en
 * repassant par la fonction elle-même entre deux points pour que le
 * trait reste sur le graphe à n'importe quel zoom.
 */
export function Arene(props: Props) {
  const cadreRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const donnees = useRef(props);
  donnees.current = props;
  const commandes = useRef({ zoom: (_facteur: number) => {}, origine: () => {} });

  useEffect(() => {
    const cadre = cadreRef.current!, canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const calque = () => { const c = document.createElement("canvas"); return [c, c.getContext("2d")!] as const; };
    const [plein, pctx] = calque();       // matière des obstacles, cratères retirés
    const [contour, octx] = calque();     // leur bord
    const [bords, tctx] = calque();       // bord des cratères, dans la matière
    const [roche, rctx] = calque();       // les trois, composés : redessinés seulement quand ils changent
    const [voile, vctx] = calque();       // brouillard sans les courbes en cours, mis en cache
    const [brume, bctx] = calque();       // brouillard de l'image
    const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, dpr = 1;
    /** Vue : centre en coordonnées du repère, pixels par unité. */
    let cx = 0, cy = 0, k = 1, kBase = 1, libre = false;
    let sale = true;
    /** Clés des calques mis en cache : vides, ils sont redessinés à la prochaine image. */
    let cacheRoche = "", cacheVoile = "";
    let theme: Theme | null = null, classeTheme = "";

    const sx = (x: number) => W / 2 + (x - cx) * k;
    const sy = (y: number) => H / 2 - (y - cy) * k;

    function origine() {
      kBase = Math.min(W / (2 * X_MAX + 3), H / (2 * Y_MAX + 3));
      cx = 0; cy = 0; k = kBase; libre = false; sale = true;
    }
    function zoomer(px: number, py: number, facteur: number) {
      const wx = cx + (px - W / 2) / k, wy = cy - (py - H / 2) / k;
      k = borner(k * facteur, kBase * 0.6, 600);
      cx = borner(wx - (px - W / 2) / k, -X_MAX, X_MAX);
      cy = borner(wy + (py - H / 2) / k, -Y_MAX, Y_MAX);
      libre = true; sale = true;
    }
    commandes.current = { zoom: (f) => zoomer(W / 2, H / 2, f), origine };

    function ajuster() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      for (const c of [canvas, plein, contour, bords, roche, voile, brume]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      cacheRoche = ""; cacheVoile = "";
      if (libre) kBase = Math.min(W / (2 * X_MAX + 3), H / (2 * Y_MAX + 3));
      else origine();
      sale = true;
    }
    const observateur = new ResizeObserver(ajuster);
    observateur.observe(canvas);
    ajuster();

    /* --- Déplacement, zoom, viseur ------------------------------------- */

    const doigts = new Map<number, { x: number; y: number }>();
    let pointeur: { x: number; y: number; jusqua: number } | null = null;
    let parcouru = 0, ecart = 0;
    const lieu = (e: PointerEvent | WheelEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const appui = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      doigts.set(e.pointerId, lieu(e));
      parcouru = 0;
      if (doigts.size === 2) {
        const [a, b] = [...doigts.values()];
        ecart = Math.hypot(a.x - b.x, a.y - b.y);
      }
      canvas.style.cursor = "grabbing";
    };
    const mouvement = (e: PointerEvent) => {
      const p = lieu(e);
      const avant = doigts.get(e.pointerId);
      if (!avant) {
        if (e.pointerType === "mouse") { pointeur = { ...p, jusqua: Infinity }; sale = true; }
        return;
      }
      doigts.set(e.pointerId, p);
      if (doigts.size === 1) {
        cx = borner(cx - (p.x - avant.x) / k, -X_MAX, X_MAX);
        cy = borner(cy + (p.y - avant.y) / k, -Y_MAX, Y_MAX);
        parcouru += Math.hypot(p.x - avant.x, p.y - avant.y);
        if (parcouru > 4) libre = true;
        if (e.pointerType === "mouse") pointeur = { ...p, jusqua: Infinity };
      } else if (doigts.size === 2) {
        const [a, b] = [...doigts.values()];
        const nouveau = Math.hypot(a.x - b.x, a.y - b.y);
        if (ecart > 0 && nouveau > 0) zoomer((a.x + b.x) / 2, (a.y + b.y) / 2, nouveau / ecart);
        ecart = nouveau;
        parcouru += 10;
      }
      sale = true;
    };
    const relache = (e: PointerEvent) => {
      if (!doigts.delete(e.pointerId)) return;
      // Un simple toucher (sans glisser) affiche les coordonnées quelques secondes.
      if (e.pointerType !== "mouse" && parcouru <= 4) pointeur = { ...lieu(e), jusqua: performance.now() + 2500 };
      if (doigts.size === 0) canvas.style.cursor = "";
      sale = true;
    };
    const sortie = (e: PointerEvent) => { if (e.pointerType === "mouse") { pointeur = null; sale = true; } };
    const molette = (e: WheelEvent) => {
      e.preventDefault();
      const p = lieu(e);
      // Firefox compte parfois en lignes ou en pages, pas en pixels.
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1);
      zoomer(p.x, p.y, Math.exp(-borner(dy, -120, 120) * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    // Safari (pavé tactile du Mac) pince par « gesture » et non par la molette.
    let echelleGeste = 1;
    const geste = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale?: number; clientX?: number; clientY?: number };
      if (e.type === "gesturestart") { echelleGeste = 1; return; }
      const r = canvas.getBoundingClientRect();
      const echelle = g.scale ?? 1;
      if (echelle > 0 && doigts.size < 2) {
        zoomer((g.clientX ?? r.left + W / 2) - r.left, (g.clientY ?? r.top + H / 2) - r.top, echelle / echelleGeste);
      }
      echelleGeste = echelle;
    };
    canvas.addEventListener("pointerdown", appui);
    canvas.addEventListener("pointermove", mouvement);
    canvas.addEventListener("pointerup", relache);
    canvas.addEventListener("pointercancel", relache);
    canvas.addEventListener("pointerleave", sortie);
    canvas.addEventListener("wheel", molette, { passive: false });
    canvas.addEventListener("dblclick", origine);
    for (const nom of ["gesturestart", "gesturechange", "gestureend"]) canvas.addEventListener(nom, geste);

    /* --- Dessin --------------------------------------------------------- */

    function lireTheme(): Theme {
      const cs = getComputedStyle(cadre);
      const v = (nom: string) => cs.getPropertyValue(nom).trim();
      return {
        papier: v("--card"), dehors: v("--muted"), encre: v("--foreground"), gris: v("--muted-foreground"),
        joueurs: Array.from({ length: 10 }, (_, i) => v(`--cf-j${i}`)),
      };
    }

    /** Trace la ligne brisée jusqu'à l'indice donné (fractionnaire) ; renvoie sa tête si elle avance encore. */
    function chemin(c: CanvasRenderingContext2D, pts: number[], jusqua: number): [number, number] | null {
      const n = pts.length / 2;
      const fin = Math.min(n - 1, jusqua);
      if (fin < 0 || n < 1) return null;
      const entier = Math.floor(fin);
      c.moveTo(sx(pts[0]), sy(pts[1]));
      for (let i = 1; i <= entier; i++) c.lineTo(sx(pts[2 * i]), sy(pts[2 * i + 1]));
      if (entier + 1 < n) {
        const f = fin - entier;
        const tx = pts[2 * entier] + (pts[2 * entier + 2] - pts[2 * entier]) * f;
        const ty = pts[2 * entier + 1] + (pts[2 * entier + 3] - pts[2 * entier + 1]) * f;
        c.lineTo(sx(tx), sy(ty));
        return [tx, ty];
      }
      return null;
    }

    function disques(c: CanvasRenderingContext2D, liste: { x: number; y: number; r: number }[]) {
      c.beginPath();
      for (const o of liste) { c.moveTo(sx(o.x) + o.r * k, sy(o.y)); c.arc(sx(o.x), sy(o.y), o.r * k, 0, TAU); }
    }
    function teinter(c: CanvasRenderingContext2D, couleur: string) {
      c.globalCompositeOperation = "source-in";
      c.fillStyle = couleur;
      c.fillRect(0, 0, W, H);
    }

    function texte(t: string, x: number, y: number, couleur: string, th: Theme) {
      ctx.lineWidth = 3; ctx.strokeStyle = th.papier; ctx.lineJoin = "round";
      ctx.strokeText(t, x, y);
      ctx.fillStyle = couleur;
      ctx.fillText(t, x, y);
    }

    let fines: Fine[] = [], finesDe: VueTraces | null = null, finesCle = "";
    let ondes: Onde[] = [];
    let dernierTick = 0, dernierN = -1, derniereImage = performance.now();
    let vues: Props | null = null;

    let raf = 0;
    function image() {
      raf = requestAnimationFrame(image);
      if (!W) return;
      const maintenant = performance.now();
      const dt = Math.min(0.05, (maintenant - derniereImage) / 1000);
      derniereImage = maintenant;

      const d = donnees.current;
      const { etat, traces, apercu, horloge, surEvenement } = d;
      if (d !== vues) { vues = d; sale = true; }
      const classe = document.documentElement.className;
      if (classe !== classeTheme || !theme) { classeTheme = classe; theme = lireTheme(); sale = true; }
      if (pointeur && maintenant > pointeur.jusqua) { pointeur = null; sale = true; }

      const tir = etat.tir;
      const enDirect = !!tir && etat.phase === "volee";
      const t = horloge();
      // On ne redessine à chaque image que pendant que les courbes avancent.
      const anime = enDirect && t >= tir.tAnimation - 50
        && ((t - tir.tAnimation) / 1000) * VITESSE / PAS <= tir.ticks + 2;
      if (!sale && !anime && ondes.length === 0) return;
      sale = false;
      const th = theme;

      const tick = enDirect ? Math.max(0, ((t - tir.tAnimation) / 1000) * VITESSE / PAS) : Infinity;
      const parId = new Map(etat.joueurs.map((p) => [p.id, p]));
      const moi = parId.get(etat.moi);
      const couleurDe = (id: string) => th.joueurs[parId.get(id)?.couleur ?? 0];
      const muet = etat.reglages.repereMuet;

      // Courbes de la volée, repassées par leur fonction quand on la connaît.
      const lignes = traces && tir && traces.n === tir.n ? traces : null;
      const cle = `${tir?.n}:${etat.joueurs.map((p) => `${p.x},${p.y}`).join(";")}`;
      if (lignes !== finesDe || cle !== finesCle) {
        finesDe = lignes; finesCle = cle;
        fines = (lignes?.traces ?? []).map((tr): Fine => {
          const p = parId.get(tr.joueur);
          const source = tr.conseil
            ? tir?.conseils.find((c) => c.id === tr.conseil)?.source
            : tir?.expressions.find((e) => e.id === tr.joueur)?.source;
          if (etat.reglages.tir === "fonction" && source && p && p.x !== null && p.y !== null) {
            try {
              const f = compiler(lire(source).arbre);
              const decalage = p.y - f(p.x, 0);
              if (Number.isFinite(decalage)) return { tr, pts: affiner(tr.pts, f, decalage), finesse: FINESSE };
            } catch { /* expression illisible : on garde les segments */ }
          }
          return { tr, pts: tr.pts, finesse: 1 };
        });
      }

      // Éliminations et impacts qui viennent de se produire.
      if (tir && tir.n !== dernierN) { dernierN = tir.n; dernierTick = Number.isFinite(tick) ? tick : Infinity; }
      if (enDirect && tick > dernierTick) {
        for (const e of tir.evenements) {
          if (e.tick <= dernierTick || e.tick > tick) continue;
          surEvenement?.(e);
          if (calme) continue;
          if (e.type === "impact") ondes.push({ x: e.x, y: e.y, vie: 0, duree: 0.35, couleur: th.gris, portee: 2 });
          else if (e.x !== null && e.y !== null) {
            ondes.push({ x: e.x, y: e.y, vie: 0, duree: 0.7, couleur: couleurDe(e.victime), portee: 6 });
          }
        }
        dernierTick = tick;
      }

      const mortAu = new Map<string, number>();
      const impactAu = new Map<string, number>();
      for (const e of tir?.evenements ?? []) {
        if (e.type === "elimination") mortAu.set(e.victime, e.tick);
        else impactAu.set(`${e.x},${e.y}`, e.tick);
      }
      const enVie = (id: string) => {
        const p = parId.get(id);
        return !!p && p.enJeu && (p.vivant || (enDirect && (mortAu.get(id) ?? -1) > tick));
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      // Feuille : l'arène en clair, le dehors grisé.
      const gx = sx(-X_MAX), dx = sx(X_MAX), hy = sy(Y_MAX), by = sy(-Y_MAX);
      ctx.fillStyle = th.dehors;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = th.papier;
      ctx.fillRect(gx, hy, dx - gx, by - hy);

      // Quadrillage : pas 1-2-5 selon le zoom, traits fins entre deux traits principaux.
      const { pas, divisions } = graduation(k);
      const fin = pas / divisions;
      const x0 = cx - W / 2 / k, x1 = cx + W / 2 / k, y0 = cy - H / 2 / k, y1 = cy + H / 2 / k;
      ctx.strokeStyle = th.encre;
      ctx.lineWidth = 1;
      if (!muet) {
        for (const [alpha, p] of [[0.06, fin], [0.16, pas]] as const) {
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          for (let i = Math.ceil(x0 / p); i * p <= x1; i++) {
            const px = Math.round(sx(i * p)) + 0.5;
            ctx.moveTo(px, 0); ctx.lineTo(px, H);
          }
          for (let i = Math.ceil(y0 / p); i * p <= y1; i++) {
            const py = Math.round(sy(i * p)) + 0.5;
            ctx.moveTo(0, py); ctx.lineTo(W, py);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(sy(0)) + 0.5); ctx.lineTo(W, Math.round(sy(0)) + 0.5);
      ctx.moveTo(Math.round(sx(0)) + 0.5, 0); ctx.lineTo(Math.round(sx(0)) + 0.5, H);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (!muet) {
        // Les nombres suivent les axes, et restent au bord quand l'axe sort de l'écran.
        ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
        const ay = borner(sy(0), 0, H - 20), ax = borner(sx(0), 34, W);
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        for (let i = Math.ceil(x0 / pas); i * pas <= x1; i++) {
          if (i !== 0) texte(ecrireNombre(i * pas), sx(i * pas), ay + 5, th.gris, th);
        }
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        for (let i = Math.ceil(y0 / pas); i * pas <= y1; i++) {
          if (i !== 0) texte(ecrireNombre(i * pas), ax - 6, sy(i * pas), th.gris, th);
        }
        if (sx(0) > 34 && sx(0) < W && sy(0) > 0 && sy(0) < H - 20) {
          ctx.textBaseline = "top";
          texte("0", sx(0) - 6, sy(0) + 5, th.gris, th);
        }
      }

      // Tout ce qui suit vit dans l'arène.
      ctx.save();
      ctx.beginPath(); ctx.rect(gx, hy, dx - gx, by - hy); ctx.clip();

      const mienne = moi ? th.joueurs[moi.couleur] : th.encre;
      const enPreparation = etat.phase === "preparation";

      // Champ de pentes de y′ = f(x, y), sous l'aperçu.
      if (apercu?.equadiff && enPreparation) {
        const maille = graduation(k, 30).pas;
        ctx.strokeStyle = th.encre; ctx.globalAlpha = 0.28; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = Math.ceil(Math.max(x0, -X_MAX) / maille); i * maille <= Math.min(x1, X_MAX); i++) {
          for (let j = Math.ceil(Math.max(y0, -Y_MAX) / maille); j * maille <= Math.min(y1, Y_MAX); j++) {
            const g = apercu.f(i * maille, j * maille);
            if (!Number.isFinite(g)) continue;
            const n = Math.hypot(1, g), ux = (5 / n), uy = (5 * g) / n;
            const px = sx(i * maille), py = sy(j * maille);
            ctx.moveTo(px - ux, py + uy); ctx.lineTo(px + ux, py - uy);
          }
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Obstacles : matière translucide, bord net, cratères retirés.
      const crateres = etat.crateres.filter((c) =>
        !tir || !enDirect || c.n < tir.crateresAvant || (impactAu.get(`${c.x},${c.y}`) ?? 0) <= tick);
      const cleRoche = `${W}|${H}|${dpr}|${cx}|${cy}|${k}|${classeTheme}|${etat.v}|${crateres.length}`;
      if (etat.obstacles.length && cleRoche !== cacheRoche) {
        cacheRoche = cleRoche;
        for (const c of [pctx, octx, tctx]) {
          c.setTransform(dpr, 0, 0, dpr, 0, 0);
          c.globalCompositeOperation = "source-over";
          c.clearRect(0, 0, W, H);
          c.fillStyle = "#000"; c.strokeStyle = "#000"; c.lineWidth = 3;
        }
        disques(pctx, etat.obstacles); pctx.fill();
        disques(octx, etat.obstacles); octx.stroke();
        octx.globalCompositeOperation = "destination-out";
        octx.fill();
        if (crateres.length) {
          pctx.globalCompositeOperation = "destination-out";
          disques(pctx, crateres); pctx.fill();
          disques(octx, crateres); octx.fill();
          tctx.drawImage(plein, 0, 0, W, H);
          tctx.globalCompositeOperation = "source-in";
          disques(tctx, crateres); tctx.stroke();
          teinter(tctx, th.encre);
        }
        teinter(pctx, th.encre);
        teinter(octx, th.encre);
        rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        rctx.globalCompositeOperation = "source-over";
        rctx.clearRect(0, 0, W, H);
        rctx.globalAlpha = 0.13; rctx.drawImage(plein, 0, 0, W, H);
        rctx.globalAlpha = 0.7; rctx.drawImage(contour, 0, 0, W, H);
        if (crateres.length) rctx.drawImage(bords, 0, 0, W, H);
        rctx.globalAlpha = 1;
      }
      if (etat.obstacles.length) ctx.drawImage(roche, 0, 0, W, H);

      const alphaTraces = enDirect ? 1 : enPreparation ? 0.3 : 0.9;
      const dessinerCourbes = (miennes: boolean) => {
        ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.lineWidth = 2.5;
        for (const { tr, pts, finesse } of fines) {
          // Courbe fantôme d'un conseiller : à sa couleur, en tirets, sous les vraies.
          const fantome = !!tr.conseil;
          if ((tr.joueur === etat.moi && !fantome) !== miennes) continue;
          const couleur = couleurDe(tr.conseil ?? tr.joueur);
          ctx.strokeStyle = couleur; ctx.globalAlpha = fantome ? alphaTraces * 0.6 : alphaTraces;
          ctx.lineWidth = fantome ? 1.75 : 2.5;
          if (fantome) ctx.setLineDash([6, 5]);
          ctx.beginPath();
          const tete = chemin(ctx, pts, (tick - tr.debut) * finesse);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          if (tete && enDirect) {
            ctx.beginPath(); ctx.arc(sx(tete[0]), sy(tete[1]), fantome ? 3 : 4, 0, TAU);
            if (fantome) { ctx.fillStyle = th.papier; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke(); }
            else { ctx.fillStyle = couleur; ctx.fill(); }
          }
        }
      };
      const dessinerJoueurs = (miens: boolean) => {
        ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
        for (const p of etat.joueurs) {
          if (p.x === null || p.y === null || (p.id === etat.moi) !== miens) continue;
          const x = sx(p.x), y = sy(p.y), r = Math.max(5, RAYON_JOUEUR * k), couleur = th.joueurs[p.couleur];
          const nom = miens ? "Toi" : p.nom.length > 12 ? `${p.nom.slice(0, 11)}…` : p.nom;
          const yNom = y - r - 7 < hy + 12 ? y + r + 16 : y - r - 7;
          if (!enVie(p.id)) {
            ctx.globalAlpha = 0.55; ctx.strokeStyle = couleur; ctx.lineWidth = 2; ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x - r * 0.6, y - r * 0.6); ctx.lineTo(x + r * 0.6, y + r * 0.6);
            ctx.moveTo(x + r * 0.6, y - r * 0.6); ctx.lineTo(x - r * 0.6, y + r * 0.6);
            ctx.stroke();
            texte(nom, x, yNom, th.gris, th);
            ctx.globalAlpha = 1;
            continue;
          }
          // Le disque est la zone à toucher, à l'échelle ; le point marque le centre.
          ctx.fillStyle = couleur; ctx.strokeStyle = couleur;
          ctx.globalAlpha = 0.2;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
          ctx.globalAlpha = 1; ctx.lineWidth = miens ? 2.5 : 1.5;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, Math.min(3.5, r * 0.45), 0, TAU); ctx.fill();
          texte(nom, x, yNom, miens ? couleur : th.encre, th);
        }
      };

      dessinerCourbes(false);
      dessinerJoueurs(false);

      // Brouillard : opaque et hachuré, sauf autour de soi et le long de ses courbes.
      // Bord adouci sans shadowBlur (très lent sur Safari et Firefox) : un dégradé
      // pour le disque, trois passes de largeur décroissante pour les couloirs.
      if (etat.voile !== null && moi && moi.x !== null && moi.y !== null) {
        const flou = 0.9 * k;
        const effacer = (c: CanvasRenderingContext2D, liste: number[][], jusqua: (i: number) => number) => {
          c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = "#000";
          for (const [largeur, alpha] of [[2 * VUE_TRACE * k + 2 * flou, 0.35], [2 * VUE_TRACE * k + flou, 0.5], [2 * VUE_TRACE * k, 1]]) {
            c.globalAlpha = alpha; c.lineWidth = largeur;
            liste.forEach((pts, i) => { c.beginPath(); chemin(c, pts, jusqua(i)); c.stroke(); });
          }
          c.globalAlpha = 1;
        };
        const cleVoile = `${W}|${H}|${dpr}|${cx}|${cy}|${k}|${classeTheme}|${etat.v}|${moi.x},${moi.y}`;
        if (cleVoile !== cacheVoile) {
          cacheVoile = cleVoile;
          vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          vctx.globalCompositeOperation = "source-over";
          vctx.globalAlpha = 1;
          vctx.fillStyle = th.papier; vctx.fillRect(0, 0, W, H);
          vctx.globalAlpha = 0.3; vctx.fillStyle = th.gris; vctx.fillRect(0, 0, W, H);
          vctx.globalAlpha = 0.1; vctx.strokeStyle = th.encre; vctx.lineWidth = 1;
          vctx.beginPath();
          for (let h = -H; h < W; h += 9) { vctx.moveTo(h, H); vctx.lineTo(h + H, 0); }
          vctx.stroke();
          vctx.globalAlpha = 1;
          vctx.globalCompositeOperation = "destination-out";
          const mx = sx(moi.x), my = sy(moi.y), r = VUE_DEPART * k;
          const degrade = vctx.createRadialGradient(mx, my, Math.max(0, r - flou), mx, my, r + flou);
          degrade.addColorStop(0, "rgba(0,0,0,1)"); degrade.addColorStop(1, "rgba(0,0,0,0)");
          vctx.fillStyle = degrade;
          vctx.beginPath(); vctx.arc(mx, my, r + flou, 0, TAU); vctx.fill();
          effacer(vctx, etat.voile.sillages, () => Infinity);
        }
        const miennes = fines.filter((f) => f.tr.joueur === etat.moi && !f.tr.conseil);
        if (enDirect && miennes.length) {
          bctx.setTransform(1, 0, 0, 1, 0, 0);
          bctx.globalCompositeOperation = "copy";
          bctx.globalAlpha = 1;
          bctx.drawImage(voile, 0, 0);
          bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          bctx.globalCompositeOperation = "destination-out";
          effacer(bctx, miennes.map((f) => f.pts), (i) => (tick - miennes[i].tr.debut) * miennes[i].finesse);
          ctx.drawImage(brume, 0, 0, W, H);
        } else ctx.drawImage(voile, 0, 0, W, H);
      }

      // Aperçu du brouillon : le graphe brut en pointillé fin, le tir (qui passe par soi) en tirets.
      if (apercu && enPreparation && moi && moi.x !== null && moi.y !== null) {
        ctx.strokeStyle = mienne; ctx.lineJoin = "round"; ctx.lineCap = "butt";
        if (!apercu.equadiff) {
          ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
          ctx.beginPath();
          for (const m of echantillonner(apercu.f, 0, Math.max(x0, -X_MAX), Math.min(x1, X_MAX), 1.5 / k, 1.5)) {
            ctx.moveTo(sx(m[0]), sy(m[1]));
            for (let i = 2; i < m.length; i += 2) ctx.lineTo(sx(m[i]), sy(m[i + 1]));
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
        for (const pts of apercu.branches) { ctx.beginPath(); chemin(ctx, pts, Infinity); ctx.stroke(); }
        ctx.setLineDash([]);
        // Là où chaque branche s'arrête.
        ctx.fillStyle = th.papier; ctx.lineWidth = 2;
        for (const pts of apercu.branches) {
          if (pts.length < 4) continue;
          ctx.beginPath(); ctx.arc(sx(pts[pts.length - 2]), sy(pts[pts.length - 1]), 4, 0, TAU);
          ctx.fill(); ctx.stroke();
        }
      }

      dessinerCourbes(true);
      dessinerJoueurs(true);

      // Ondes : un anneau qui s'élargit là où une courbe a touché.
      ondes = ondes.filter((o) => (o.vie += dt) < o.duree);
      for (const o of ondes) {
        const u = o.vie / o.duree;
        ctx.globalAlpha = 1 - u; ctx.strokeStyle = o.couleur; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx(o.x), sy(o.y), (0.6 + u * o.portee) * k, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Bord de l'arène.
      ctx.strokeStyle = th.encre; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
      ctx.strokeRect(gx, hy, dx - gx, by - hy);
      ctx.globalAlpha = 1;

      // Viseur : coordonnées du point survolé (absent en repère muet).
      if (pointeur && !muet && doigts.size === 0) {
        const { x, y } = pointeur;
        ctx.strokeStyle = th.encre; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, H);
        ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(W, Math.round(y) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        const dec = k > 150 ? 3 : k > 40 ? 2 : 1;
        const libelle = `(${ecrireNombre(cx + (x - W / 2) / k, dec)} ; ${ecrireNombre(cy - (y - H / 2) / k, dec)})`;
        ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
        const l = ctx.measureText(libelle).width + 14;
        const bx = x + 12 + l > W ? x - 12 - l : x + 12, byy = y - 32 < 0 ? y + 12 : y - 32;
        ctx.fillStyle = th.encre;
        ctx.beginPath();
        // roundRect manque aux Safari d'avant 16 et aux Firefox d'avant 112.
        if (typeof ctx.roundRect === "function") ctx.roundRect(bx, byy, l, 22, 6); else ctx.rect(bx, byy, l, 22);
        ctx.fill();
        ctx.fillStyle = th.papier; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(libelle, bx + 7, byy + 11.5);
      }
    }
    raf = requestAnimationFrame(image);

    return () => {
      cancelAnimationFrame(raf);
      observateur.disconnect();
      canvas.removeEventListener("pointerdown", appui);
      canvas.removeEventListener("pointermove", mouvement);
      canvas.removeEventListener("pointerup", relache);
      canvas.removeEventListener("pointercancel", relache);
      canvas.removeEventListener("pointerleave", sortie);
      canvas.removeEventListener("wheel", molette);
      canvas.removeEventListener("dblclick", origine);
      for (const nom of ["gesturestart", "gesturechange", "gestureend"]) canvas.removeEventListener(nom, geste);
    };
  }, []);

  return (
    <div ref={cadreRef} className="cf-graphe">
      <canvas ref={canvasRef} aria-label="Repère de Curve Fight : glisser pour se déplacer, molette ou pincement pour zoomer" />
      {props.children}
      <div className="cf-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoomer" onClick={() => commandes.current.zoom(1.5)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" aria-label="Dézoomer" onClick={() => commandes.current.zoom(1 / 1.5)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <button type="button" aria-label="Revenir à la vue d’ensemble" onClick={() => commandes.current.origine()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9" /></svg>
        </button>
      </div>
    </div>
  );
}
