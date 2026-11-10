"use client";

import { useEffect, useRef } from "react";
import { PAS, RAYON_JOUEUR, VITESSE, VUE_DEPART, VUE_TRACE, X_MAX, Y_MAX } from "@/lib/courbes/monde";
import { COULEURS, type VueEvenement, type VueSalon, type VueTrace, type VueTraces } from "@/lib/courbes/vue";

type Props = {
  etat: VueSalon;
  traces: VueTraces | null;
  /** Horloge du serveur, en ms. */
  horloge: () => number;
  surEvenement?: (e: VueEvenement) => void;
};

type Particule = { x: number; y: number; vx: number; vy: number; vie: number; duree: number; couleur: string; taille: number };
type Onde = { x: number; y: number; vie: number; couleur: string };

/*
 * L'arène : un canvas redessiné à chaque image. Le serveur a déjà tout
 * calculé ; ici on rejoue la volée au rythme de son horloge (un point de
 * courbe par tick), on fait apparaître cratères et éliminations au bon
 * moment, et on pose le brouillard par-dessus ce qui n'est pas à soi.
 */
export function Arene(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const donnees = useRef(props);
  donnees.current = props;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const couche = document.createElement("canvas");      // obstacles creusés
    const cctx = couche.getContext("2d")!;
    const brume = document.createElement("canvas");       // brouillard
    const bctx = brume.getContext("2d")!;
    const calme = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W = 0, H = 0, dpr = 1, k = 1;
    let cleCouche = "";
    function ajuster() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height; k = W / (2 * X_MAX);
      for (const c of [canvas, couche, brume]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      cleCouche = "";
    }
    const observateur = new ResizeObserver(ajuster);
    observateur.observe(canvas);
    ajuster();

    const sx = (x: number) => (x + X_MAX) * k;
    const sy = (y: number) => (Y_MAX - y) * k;

    let pointeur: { x: number; y: number; jusqua: number } | null = null;
    const viser = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointeur = { x: e.clientX - r.left, y: e.clientY - r.top, jusqua: e.pointerType === "mouse" ? Infinity : performance.now() + 2500 };
    };
    const lacher = (e: PointerEvent) => { if (e.pointerType === "mouse") pointeur = null; };
    canvas.addEventListener("pointermove", viser);
    canvas.addEventListener("pointerdown", viser);
    canvas.addEventListener("pointerleave", lacher);

    let particules: Particule[] = [];
    let ondes: Onde[] = [];
    let secousse = 0;
    let dernierTick = 0, dernierN = -1, derniereImage = performance.now();

    function eclats(x: number, y: number, couleur: string, n: number, force: number) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 2 * Math.PI, v = (0.3 + Math.random()) * force;
        particules.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vie: 0,
                          duree: 0.5 + Math.random() * 0.7, couleur, taille: 1 + Math.random() * 2.2 });
      }
    }

    /** Trace une courbe jusqu'au tick donné ; renvoie sa tête si elle avance encore. */
    function chemin(c: CanvasRenderingContext2D, tr: VueTrace, tick: number): [number, number] | null {
      const n = tr.pts.length / 2;
      const jusqua = Math.min(n - 1, tick - tr.debut);
      if (jusqua < 0 || n < 1) return null;
      const entier = Math.floor(jusqua);
      c.moveTo(sx(tr.pts[0]), sy(tr.pts[1]));
      for (let i = 1; i <= entier; i++) c.lineTo(sx(tr.pts[2 * i]), sy(tr.pts[2 * i + 1]));
      let tx = tr.pts[2 * entier], ty = tr.pts[2 * entier + 1];
      if (entier + 1 < n) {
        const f = jusqua - entier;
        tx += (tr.pts[2 * entier + 2] - tx) * f;
        ty += (tr.pts[2 * entier + 3] - ty) * f;
        c.lineTo(sx(tx), sy(ty));
        return [tx, ty];
      }
      return null;
    }

    function courbe(tr: VueTrace, tick: number, couleur: string, alpha: number) {
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      const tete = chemin(ctx, tr, tick);
      ctx.globalAlpha = alpha * 0.22; ctx.strokeStyle = couleur; ctx.lineWidth = 7; ctx.stroke();
      ctx.globalAlpha = alpha; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = alpha * 0.9; ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.globalAlpha = 1;
      if (tete && Number.isFinite(tick)) {
        ctx.save();
        ctx.shadowColor = couleur; ctx.shadowBlur = 14; ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(sx(tete[0]), sy(tete[1]), 3, 0, 2 * Math.PI); ctx.fill();
        ctx.restore();
      }
    }

    function etiquette(texte: string, x: number, y: number, couleur: string, taille = 10) {
      ctx.font = `600 ${taille}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(4,7,14,0.9)"; ctx.lineJoin = "round";
      ctx.strokeText(texte, x, y);
      ctx.fillStyle = couleur;
      ctx.fillText(texte, x, y);
    }

    let raf = 0;
    function image() {
      raf = requestAnimationFrame(image);
      if (!W) return;
      const { etat, traces, horloge, surEvenement } = donnees.current;
      const t = horloge();
      const maintenant = performance.now();
      const dt = Math.min(0.05, (maintenant - derniereImage) / 1000);
      derniereImage = maintenant;

      const tir = etat.tir;
      const enDirect = !!tir && etat.phase === "volee";
      const tick = enDirect ? Math.max(0, ((t - tir.tAnimation) / 1000) * VITESSE / PAS) : Infinity;
      const lignes = traces && tir && traces.n === tir.n ? traces.traces : [];
      const parId = new Map(etat.joueurs.map((p) => [p.id, p]));
      const moi = parId.get(etat.moi);

      // Éliminations et impacts qui viennent de se produire.
      if (tir && tir.n !== dernierN) { dernierN = tir.n; dernierTick = Number.isFinite(tick) ? tick : Infinity; }
      if (enDirect && tick > dernierTick) {
        for (const e of tir.evenements) {
          if (e.tick <= dernierTick || e.tick > tick) continue;
          surEvenement?.(e);
          if (e.type === "impact") {
            eclats(e.x, e.y, "#7fb0ff", 14, 5);
            secousse = Math.max(secousse, 2.5);
          } else if (e.x !== null && e.y !== null) {
            const couleur = COULEURS[parId.get(e.victime)?.couleur ?? 0];
            eclats(e.x, e.y, couleur, 46, 9);
            eclats(e.x, e.y, "#ffffff", 14, 12);
            ondes.push({ x: e.x, y: e.y, vie: 0, couleur });
            secousse = 9;
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
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (secousse > 0.1 && !calme) {
        ctx.translate((Math.random() - 0.5) * secousse, (Math.random() - 0.5) * secousse);
        secousse *= Math.pow(0.004, dt);
      } else secousse = 0;

      // Fond.
      const fond = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.7);
      fond.addColorStop(0, "#0d1426"); fond.addColorStop(1, "#060912");
      ctx.fillStyle = fond;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      // Repère.
      const muet = etat.reglages.repereMuet;
      ctx.lineWidth = 1;
      if (!muet) {
        for (let x = -X_MAX; x <= X_MAX; x++) {
          ctx.strokeStyle = x % 5 === 0 ? "rgba(140,170,255,0.13)" : "rgba(140,170,255,0.045)";
          ctx.beginPath(); ctx.moveTo(Math.round(sx(x)) + 0.5, 0); ctx.lineTo(Math.round(sx(x)) + 0.5, H); ctx.stroke();
        }
        for (let y = -Y_MAX; y <= Y_MAX; y++) {
          ctx.strokeStyle = y % 5 === 0 ? "rgba(140,170,255,0.13)" : "rgba(140,170,255,0.045)";
          ctx.beginPath(); ctx.moveTo(0, Math.round(sy(y)) + 0.5); ctx.lineTo(W, Math.round(sy(y)) + 0.5); ctx.stroke();
        }
      }
      ctx.strokeStyle = muet ? "rgba(170,195,255,0.28)" : "rgba(170,195,255,0.42)";
      ctx.beginPath();
      ctx.moveTo(0, Math.round(sy(0)) + 0.5); ctx.lineTo(W, Math.round(sy(0)) + 0.5);
      ctx.moveTo(Math.round(sx(0)) + 0.5, 0); ctx.lineTo(Math.round(sx(0)) + 0.5, H);
      ctx.stroke();
      if (!muet) {
        const taille = Math.max(8, Math.min(11, k * 1.1));
        ctx.font = `${taille}px ui-monospace, monospace`;
        ctx.fillStyle = "rgba(190,210,255,0.5)";
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        for (let x = -X_MAX + 5; x < X_MAX; x += 5) if (x) ctx.fillText(String(x), sx(x), sy(0) + 3);
        ctx.textAlign = "right"; ctx.textBaseline = "middle";
        for (let y = -Y_MAX + 5; y < Y_MAX; y += 5) if (y) ctx.fillText(String(y), sx(0) - 4, sy(y));
      }

      // Obstacles : disques pleins, cratères retirés, lueur sur tout le contour.
      const crateres = etat.crateres.filter((c) =>
        !tir || !enDirect || c.n < tir.crateresAvant || (impactAu.get(`${c.x},${c.y}`) ?? 0) <= tick);
      const empreinte = etat.obstacles.reduce((a, o) => a + o.x * 7 + o.y * 13 + o.r, 0);
      const cle = `${etat.manche}:${etat.obstacles.length}:${empreinte}:${crateres.length}:${W}`;
      if (cle !== cleCouche) {
        cleCouche = cle;
        cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cctx.globalCompositeOperation = "source-over";
        cctx.clearRect(0, 0, W, H);
        cctx.fillStyle = "#1a2d55";
        for (const o of etat.obstacles) { cctx.beginPath(); cctx.arc(sx(o.x), sy(o.y), o.r * k, 0, 2 * Math.PI); cctx.fill(); }
        // Hachures de tableau noir, à l'intérieur de la matière seulement.
        cctx.globalCompositeOperation = "source-atop";
        cctx.strokeStyle = "rgba(120,160,255,0.16)"; cctx.lineWidth = 1;
        cctx.beginPath();
        for (let d = -H; d < W; d += 7) { cctx.moveTo(d, 0); cctx.lineTo(d + H, H); }
        cctx.stroke();
        cctx.globalCompositeOperation = "destination-out";
        for (const c of crateres) { cctx.beginPath(); cctx.arc(sx(c.x), sy(c.y), c.r * k, 0, 2 * Math.PI); cctx.fill(); }
        cctx.globalCompositeOperation = "source-over";
      }
      ctx.save();
      ctx.shadowColor = "#4d86ff"; ctx.shadowBlur = 12;
      ctx.drawImage(couche, 0, 0, W, H);
      ctx.restore();

      const sousVoile = etat.voile !== null;
      const alphaTraces = enDirect ? 1 : etat.phase === "preparation" ? 0.32 : 0.85;
      const dessinerCourbes = (miennes: boolean) => {
        for (const tr of lignes) {
          if ((tr.joueur === etat.moi) !== miennes) continue;
          courbe(tr, tick, COULEURS[parId.get(tr.joueur)?.couleur ?? 0], alphaTraces);
        }
      };
      const dessinerJoueurs = (miens: boolean) => {
        for (const p of etat.joueurs) {
          if (p.x === null || p.y === null || (p.id === etat.moi) !== miens) continue;
          const x = sx(p.x), y = sy(p.y), r = Math.max(4, RAYON_JOUEUR * k), couleur = COULEURS[p.couleur];
          if (!enVie(p.id)) {
            ctx.globalAlpha = 0.45; ctx.strokeStyle = couleur; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - r * 0.7, y - r * 0.7); ctx.lineTo(x + r * 0.7, y + r * 0.7);
            ctx.moveTo(x + r * 0.7, y - r * 0.7); ctx.lineTo(x - r * 0.7, y + r * 0.7);
            ctx.stroke();
            ctx.globalAlpha = 1;
            continue;
          }
          ctx.save();
          ctx.shadowColor = couleur; ctx.shadowBlur = 16; ctx.fillStyle = couleur;
          ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
          ctx.restore();
          ctx.fillStyle = "rgba(6,9,18,0.55)";
          ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 2 * Math.PI); ctx.fill();
          if (miens) {
            const pouls = (maintenant / 1400) % 1;
            ctx.strokeStyle = couleur; ctx.lineWidth = 1.5; ctx.globalAlpha = 1 - pouls;
            ctx.beginPath(); ctx.arc(x, y, r + 3 + pouls * 16, 0, 2 * Math.PI); ctx.stroke();
            ctx.globalAlpha = 1;
          }
          const nom = miens ? "toi" : p.nom.length > 12 ? `${p.nom.slice(0, 11)}…` : p.nom;
          etiquette(nom, Math.min(W - 24, Math.max(24, x)), y - r - 5 < 12 ? y + r + 13 : y - r - 5, couleur);
        }
      };

      dessinerCourbes(false);
      dessinerJoueurs(false);

      // Brouillard : tout est couvert, sauf autour de soi et le long de ses courbes.
      if (sousVoile && moi && moi.x !== null && moi.y !== null) {
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        bctx.globalCompositeOperation = "source-over";
        bctx.shadowBlur = 0;
        bctx.clearRect(0, 0, W, H);
        // Opaque : rien de ce qui est dessous ne doit transparaître. Des nappes plus claires dérivent.
        bctx.fillStyle = "#121829";
        bctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 9; i++) {
          const bx = W * (0.5 + 0.55 * Math.sin(maintenant / (9000 + i * 1700) + i * 2.1));
          const by = H * (0.5 + 0.5 * Math.cos(maintenant / (7000 + i * 1300) + i));
          const g = bctx.createRadialGradient(bx, by, 0, bx, by, W * 0.2);
          g.addColorStop(0, "rgba(150,170,225,0.16)"); g.addColorStop(1, "rgba(150,170,225,0)");
          bctx.fillStyle = g;
          bctx.fillRect(0, 0, W, H);
        }
        bctx.globalCompositeOperation = "destination-out";
        bctx.shadowColor = "#000"; bctx.shadowBlur = k * 1.6 * dpr;
        bctx.fillStyle = "#000"; bctx.strokeStyle = "#000";
        bctx.beginPath(); bctx.arc(sx(moi.x), sy(moi.y), VUE_DEPART * k, 0, 2 * Math.PI); bctx.fill();
        bctx.lineWidth = 2 * VUE_TRACE * k; bctx.lineJoin = "round"; bctx.lineCap = "round";
        for (const pts of etat.voile!.sillages) {
          bctx.beginPath();
          chemin(bctx, { joueur: "", dir: 1, debut: 0, pts, fin: null }, Infinity);
          bctx.stroke();
        }
        for (const tr of lignes) {
          if (tr.joueur !== etat.moi) continue;
          bctx.beginPath();
          chemin(bctx, tr, tick);
          bctx.stroke();
        }
        bctx.shadowBlur = 0;
        ctx.drawImage(brume, 0, 0, W, H);
      }

      dessinerCourbes(true);
      dessinerJoueurs(true);

      // Éclats et ondes de choc.
      particules = particules.filter((p) => (p.vie += dt) < p.duree);
      for (const p of particules) {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.08, dt); p.vy *= Math.pow(0.08, dt);
        ctx.globalAlpha = 1 - p.vie / p.duree;
        ctx.fillStyle = p.couleur;
        ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), p.taille, 0, 2 * Math.PI); ctx.fill();
      }
      ondes = ondes.filter((o) => (o.vie += dt) < 0.7);
      for (const o of ondes) {
        ctx.globalAlpha = 1 - o.vie / 0.7; ctx.strokeStyle = o.couleur; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx(o.x), sy(o.y), (0.8 + o.vie * 9) * k, 0, 2 * Math.PI); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // Viseur : coordonnées du point survolé (absent en repère muet).
      if (pointeur && maintenant > pointeur.jusqua) pointeur = null;
      if (pointeur && !muet) {
        const { x, y } = pointeur;
        ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.setLineDash([]);
        const texte = `(${(x / k - X_MAX).toFixed(1)} ; ${(Y_MAX - y / k).toFixed(1)})`;
        ctx.font = "600 11px ui-monospace, monospace";
        const l = ctx.measureText(texte).width + 12;
        const bx = x + 12 + l > W ? x - 12 - l : x + 12, by = y - 30 < 0 ? y + 12 : y - 30;
        ctx.fillStyle = "rgba(4,7,14,0.88)";
        ctx.beginPath(); ctx.roundRect(bx, by, l, 20, 6); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(texte, bx + 6, by + 10.5);
      }
    }
    raf = requestAnimationFrame(image);

    return () => {
      cancelAnimationFrame(raf);
      observateur.disconnect();
      canvas.removeEventListener("pointermove", viser);
      canvas.removeEventListener("pointerdown", viser);
      canvas.removeEventListener("pointerleave", lacher);
    };
  }, []);

  return (
    <canvas ref={canvasRef} aria-label="Arène de Curve Fight"
            className="block aspect-[5/3] w-full touch-pan-y rounded-[var(--radius-lg)] border border-white/10 bg-[#060912]" />
  );
}
