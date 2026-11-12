"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOMS_COULEURS, PALETTE, TAILLE, decoderToile, formatAttente, normaliserZone,
  type EtatToile, type InfoPixel, type Zone,
} from "@/lib/place/commun";
import { Moderation } from "./Moderation";

type Vue = { s: number; tx: number; ty: number };
type Point = { x: number; y: number };
type Geste =
  | { mode: "aucun" }
  | { mode: "tap" | "pan"; depart: Point; vue: Vue }
  | { mode: "pinch"; dist: number; milieu: Point; vue: Vue };

const ZOOM_MAX = 48;
/** En dessous de cette échelle, toucher la toile zoome d'abord sur le point touché. */
const ZOOM_LECTURE = 10;

const RGB = PALETTE.map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));

const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

function ilYa(iso: string, maintenant: number): string {
  const s = Math.max(0, Math.round((maintenant - Date.parse(iso)) / 1000));
  if (s < 60) return "à l’instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `le ${new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

export function Toile({ admin }: { admin: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cadreRef = useRef<HTMLDivElement>(null);
  const pixels = useRef<Uint8Array>(new Uint8Array(TAILLE * TAILLE));
  const version = useRef(-1);
  const decalage = useRef(0); // horloge serveur − horloge locale

  const [pret, setPret] = useState(false);
  const [cote, setCote] = useState(0);
  const [vue, setVueEtat] = useState<Vue>({ s: 1, tx: 0, ty: 0 });
  const vueRef = useRef(vue);
  const [etat, setEtat] = useState({ delai: 300, gelee: false, banni: false, prochain: 0 });
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [selection, setSelection] = useState<Point | null>(null);
  const [couleur, setCouleur] = useState<number | null>(null);
  const [info, setInfo] = useState<InfoPixel | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [hors, setHors] = useState(false);

  // Modération
  const [sansDelai, setSansDelai] = useState(false);
  const [modeZone, setModeZone] = useState(false);
  const [coins, setCoins] = useState<Point[]>([]);
  const zone: Zone | null = coins.length === 2
    ? normaliserZone({ x0: coins[0].x, y0: coins[0].y, x1: coins[1].x, y1: coins[1].y })
    : null;

  /* --- Dessin ----------------------------------------------------------- */

  const dessinerTout = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(TAILLE, TAILLE);
    pixels.current.forEach((c, i) => {
      const [r, g, b] = RGB[c] ?? RGB[0];
      img.data.set([r, g, b, 255], i * 4);
    });
    ctx.putImageData(img, 0, 0);
  }, []);

  const poser = useCallback((x: number, y: number, c: number) => {
    pixels.current[y * TAILLE + x] = c;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = PALETTE[c] ?? PALETTE[0];
    ctx.fillRect(x, y, 1, 1);
  }, []);

  /* --- Vue : zoom et déplacement ----------------------------------------- */

  const borner = useCallback((v: Vue): Vue => {
    const w = cadreRef.current?.clientWidth ?? 0;
    if (!w) return v;
    const s = Math.min(ZOOM_MAX, Math.max(w / TAILLE, v.s));
    const t = TAILLE * s;
    const axe = (d: number) => (t <= w ? (w - t) / 2 : Math.min(0, Math.max(w - t, d)));
    return { s, tx: axe(v.tx), ty: axe(v.ty) };
  }, []);

  const setVue = useCallback((v: Vue) => {
    const b = borner(v);
    vueRef.current = b;
    setVueEtat(b);
  }, [borner]);

  /** Zoom d'un facteur autour d'un point de l'écran (coordonnées dans le cadre). */
  const zoomer = useCallback((facteur: number, autour: Point) => {
    const v = vueRef.current;
    const s = Math.min(ZOOM_MAX, Math.max(0, v.s * facteur));
    const wx = (autour.x - v.tx) / v.s, wy = (autour.y - v.ty) / v.s;
    setVue({ s, tx: autour.x - wx * s, ty: autour.y - wy * s });
  }, [setVue]);

  useEffect(() => {
    const cadre = cadreRef.current;
    if (!cadre) return;
    const ro = new ResizeObserver(() => {
      const w = cadre.clientWidth;
      setCote(w);
      // Premier affichage : toile entière. Ensuite on garde le zoom, recadré.
      setVue(vueRef.current.s === 1 && vueRef.current.tx === 0 ? { s: w / TAILLE, tx: 0, ty: 0 } : vueRef.current);
    });
    ro.observe(cadre);
    const roulette = (e: WheelEvent) => {
      e.preventDefault();
      const r = cadre.getBoundingClientRect();
      zoomer(Math.exp(-e.deltaY * 0.002), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    cadre.addEventListener("wheel", roulette, { passive: false });
    return () => { ro.disconnect(); cadre.removeEventListener("wheel", roulette); };
  }, [setVue, zoomer]);

  /* --- Synchronisation (attente longue) ---------------------------------- */

  const appliquer = useCallback((d: EtatToile) => {
    decalage.current = d.maintenant - Date.now();
    if (d.plein) {
      pixels.current = decoderToile(d.plein);
      dessinerTout();
    } else if (d.changements) {
      for (let i = 0; i + 2 < d.changements.length; i += 3) poser(d.changements[i], d.changements[i + 1], d.changements[i + 2]);
    }
    version.current = d.v;
    setEtat({
      delai: d.delai, gelee: d.gelee, banni: d.banni,
      prochain: d.prochain ? d.prochain - decalage.current : 0,
    });
    setPret(true);
  }, [dessinerTout, poser]);

  useEffect(() => {
    let actif = true;
    const ctrl = new AbortController();
    (async () => {
      let echecs = 0;
      while (actif) {
        try {
          const r = await fetch(`/api/toile?v=${version.current}`, { cache: "no-store", signal: ctrl.signal });
          if (r.status === 401) { setErreur("Session expirée, reconnecte-toi"); return; }
          if (!r.ok) throw new Error(String(r.status));
          const d = await r.json() as EtatToile;
          if (typeof d.v === "number") appliquer(d);
          echecs = 0;
          setHors(false);
        } catch {
          if (!actif) return;
          echecs++;
          if (echecs >= 2) setHors(true);
          await pause(Math.min(15_000, 1000 * 2 ** echecs));
        }
      }
    })();
    return () => { actif = false; ctrl.abort(); };
  }, [appliquer]);

  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* --- Sélection d'un pixel ---------------------------------------------- */

  const infoSeq = useRef(0);
  const chargerInfo = useCallback(async (p: Point) => {
    const n = ++infoSeq.current;
    setInfo(null);
    try {
      const r = await fetch(`/api/toile/pixel?x=${p.x}&y=${p.y}`, { cache: "no-store" });
      if (r.ok && n === infoSeq.current) setInfo(await r.json());
    } catch { /* l'info reste vide */ }
  }, []);

  const choisir = useCallback((p: Point) => {
    setErreur(null);
    if (modeZone) {
      setCoins(c => (c.length === 1 ? [c[0], p] : [p]));
      return;
    }
    setSelection(p);
    chargerInfo(p);
  }, [modeZone, chargerInfo]);

  const toucher = useCallback((ecran: Point) => {
    const v = vueRef.current;
    const x = Math.floor((ecran.x - v.tx) / v.s), y = Math.floor((ecran.y - v.ty) / v.s);
    if (x < 0 || y < 0 || x >= TAILLE || y >= TAILLE) return;
    if (v.s < ZOOM_LECTURE && !modeZone) zoomer(ZOOM_LECTURE * 1.4 / v.s, ecran);
    choisir({ x, y });
  }, [choisir, zoomer, modeZone]);

  // Rafraîchit l'auteur quand le pixel sélectionné change sous nos yeux.
  const couleurSel = selection ? pixels.current[selection.y * TAILLE + selection.x] : -1;
  useEffect(() => {
    if (selection && info && info.x === selection.x && info.y === selection.y && info.couleur !== couleurSel) {
      chargerInfo(selection);
    }
  }, [couleurSel, selection, info, chargerInfo]);

  /* --- Gestes ------------------------------------------------------------ */

  const doigts = useRef(new Map<number, Point>());
  const geste = useRef<Geste>({ mode: "aucun" });

  function local(e: React.PointerEvent): Point {
    const r = cadreRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function pince(): { dist: number; milieu: Point } {
    const [a, b] = [...doigts.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  function bas(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    doigts.current.set(e.pointerId, local(e));
    if (doigts.current.size === 1) {
      geste.current = { mode: "tap", depart: local(e), vue: vueRef.current };
    } else if (doigts.current.size === 2) {
      geste.current = { mode: "pinch", ...pince(), vue: vueRef.current };
    }
  }

  function bouge(e: React.PointerEvent) {
    if (!doigts.current.has(e.pointerId)) return;
    const p = local(e);
    doigts.current.set(e.pointerId, p);
    const g = geste.current;
    if (g.mode === "pinch" && doigts.current.size >= 2) {
      const { dist, milieu } = pince();
      const s = g.vue.s * dist / g.dist;
      const wx = (g.milieu.x - g.vue.tx) / g.vue.s, wy = (g.milieu.y - g.vue.ty) / g.vue.s;
      setVue({ s, tx: milieu.x - wx * s, ty: milieu.y - wy * s });
    } else if (g.mode === "tap" || g.mode === "pan") {
      const dx = p.x - g.depart.x, dy = p.y - g.depart.y;
      if (g.mode === "tap" && Math.hypot(dx, dy) < 6) return;
      geste.current = { ...g, mode: "pan" };
      setVue({ s: g.vue.s, tx: g.vue.tx + dx, ty: g.vue.ty + dy });
    }
  }

  function haut(e: React.PointerEvent) {
    if (!doigts.current.has(e.pointerId)) return;
    doigts.current.delete(e.pointerId);
    const g = geste.current;
    if (doigts.current.size === 1 && g.mode === "pinch") {
      // Un doigt reste : on continue en déplacement depuis sa position.
      geste.current = { mode: "pan", depart: [...doigts.current.values()][0], vue: vueRef.current };
    } else if (doigts.current.size === 0) {
      if (g.mode === "tap" && e.type === "pointerup") toucher(local(e));
      geste.current = { mode: "aucun" };
    }
  }

  function clavier(e: React.KeyboardEvent) {
    const pas: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const centre = { x: cote / 2, y: cote / 2 };
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomer(1.4, centre); return; }
    if (e.key === "-") { e.preventDefault(); zoomer(1 / 1.4, centre); return; }
    if (e.key === "Enter" && selection) { e.preventDefault(); envoyer(); return; }
    const d = pas[e.key];
    if (!d) return;
    e.preventDefault();
    const base = selection ?? { x: TAILLE / 2, y: TAILLE / 2 };
    choisir({
      x: Math.min(TAILLE - 1, Math.max(0, base.x + d.x)),
      y: Math.min(TAILLE - 1, Math.max(0, base.y + d.y)),
    });
  }

  /* --- Pose -------------------------------------------------------------- */

  const pinceauAdmin = admin && sansDelai;
  // Borné au délai : la latence ne doit pas afficher « 5:01 ».
  const attente = !pinceauAdmin && etat.prochain > maintenant
    ? Math.min(etat.prochain - maintenant, etat.delai * 1000) : 0;
  const bloque = etat.banni || (etat.gelee && !pinceauAdmin);

  async function envoyer() {
    if (!selection || couleur === null || envoi || bloque || attente > 0) return;
    const { x, y } = selection;
    const avant = pixels.current[y * TAILLE + x];
    setEnvoi(true);
    setErreur(null);
    poser(x, y, couleur); // optimiste ; la synchronisation confirme
    try {
      const r = await fetch("/api/toile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x, y, couleur, sansDelai: pinceauAdmin }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.erreur || "Pixel refusé");
      if (d.prochain) setEtat(e => ({ ...e, prochain: d.prochain - decalage.current }));
      chargerInfo({ x, y });
    } catch (err) {
      poser(x, y, avant);
      setErreur(err instanceof Error ? err.message : "Pixel refusé");
    } finally {
      setEnvoi(false);
    }
  }

  let libelle = "Poser le pixel";
  if (etat.banni) libelle = "Tu ne peux plus poser de pixels";
  else if (bloque) libelle = "Toile gelée";
  else if (attente > 0) libelle = `Prochain pixel dans ${formatAttente(attente)}`;
  else if (!selection) libelle = "Touche la toile pour choisir un pixel";
  else if (couleur === null) libelle = "Choisis une couleur";
  const peutPoser = !!selection && couleur !== null && !envoi && !bloque && attente === 0;

  /* --- Rendu ------------------------------------------------------------- */

  const carre = (x: number, y: number, w = 1, h = 1) => ({
    left: vue.tx + x * vue.s, top: vue.ty + y * vue.s, width: w * vue.s, height: h * vue.s,
  });
  const delaiTexte = etat.delai % 60 === 0 ? `${etat.delai / 60} min` : `${etat.delai} s`;

  return (
    <div className="flex flex-col gap-5">
      <div
        ref={cadreRef}
        role="application"
        aria-label={`Toile de ${TAILLE} × ${TAILLE} pixels. Flèches pour choisir un pixel, + et − pour zoomer, Entrée pour poser.`}
        tabIndex={0}
        onKeyDown={clavier}
        onPointerDown={bas}
        onPointerMove={bouge}
        onPointerUp={haut}
        onPointerCancel={haut}
        className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-[var(--radius-lg)]
                   border border-[var(--hairline)] bg-[var(--muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        style={{ cursor: modeZone ? "crosshair" : "default" }}
      >
        <canvas
          ref={canvasRef}
          width={TAILLE}
          height={TAILLE}
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: TAILLE, height: TAILLE, imageRendering: "pixelated",
            transform: `translate(${vue.tx}px, ${vue.ty}px) scale(${vue.s})`,
            opacity: pret ? 1 : 0,
          }}
        />
        {!pret && (
          <div className="absolute inset-0 grid place-items-center text-[14px] text-[var(--muted-foreground)]">
            Chargement de la toile…
          </div>
        )}
        {selection && !modeZone && (
          <div className="pointer-events-none absolute" style={{
            ...carre(selection.x, selection.y),
            background: couleur !== null && peutPoser ? PALETTE[couleur] : undefined,
            boxShadow: "0 0 0 2px #000, 0 0 0 4px #fff",
          }} />
        )}
        {modeZone && coins.length === 1 && (
          <div className="pointer-events-none absolute" style={{ ...carre(coins[0].x, coins[0].y), boxShadow: "0 0 0 2px #e63946" }} />
        )}
        {modeZone && zone && (
          <div className="pointer-events-none absolute" style={{
            ...carre(zone.x0, zone.y0, zone.x1 - zone.x0 + 1, zone.y1 - zone.y0 + 1),
            background: "rgba(230,57,70,0.15)", boxShadow: "0 0 0 2px #e63946",
          }} />
        )}
        {(hors || etat.gelee) && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-[var(--foreground)] px-3 py-1
                          text-[12px] font-medium text-[var(--background)]">
            {hors ? "Reconnexion…" : "Toile gelée"}
          </div>
        )}
      </div>

      <div className="flex min-h-[44px] items-center justify-between gap-3 text-[14px]">
        <p className="m-0 text-[var(--muted-foreground)]" aria-live="polite">
          {modeZone ? (
            zone ? `Zone (${zone.x0}, ${zone.y0}) → (${zone.x1}, ${zone.y1})`
              : coins.length === 1 ? "Touche le coin opposé" : "Touche un premier coin"
          ) : selection ? (
            <>
              <span className="tabular font-medium text-[var(--foreground)]">({selection.x}, {selection.y})</span>
              {" · "}
              {info && info.x === selection.x && info.y === selection.y
                ? info.le
                  ? <>{info.nature === "admin" ? "modération" : info.auteur?.nom ?? "compte supprimé"}, {ilYa(info.le, maintenant)}</>
                  : "jamais touché"
                : "…"}
            </>
          ) : `Un pixel toutes les ${delaiTexte}. Pince ou molette pour zoomer.`}
        </p>
        <div className="flex gap-2">
          <button type="button" className="bouton-rond" aria-label="Dézoomer" onClick={() => zoomer(1 / 1.6, { x: cote / 2, y: cote / 2 })}>−</button>
          <button type="button" className="bouton-rond" aria-label="Zoomer" onClick={() => zoomer(1.6, { x: cote / 2, y: cote / 2 })}>+</button>
        </div>
      </div>

      <div className="grid grid-cols-9 gap-2" role="radiogroup" aria-label="Couleur">
        {PALETTE.map((hex, i) => (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={couleur === i}
            aria-label={NOMS_COULEURS[i]}
            title={NOMS_COULEURS[i]}
            onClick={() => setCouleur(i)}
            className="aspect-square w-full rounded-[var(--radius-sm,6px)] border border-[var(--border)]"
            style={{
              background: hex,
              boxShadow: couleur === i ? "0 0 0 2px var(--background), 0 0 0 4px var(--foreground)" : undefined,
            }}
          />
        ))}
      </div>

      <button type="button" className="bouton-principal" disabled={!peutPoser} onClick={envoyer}>
        {envoi ? "Envoi…" : libelle}
      </button>
      {erreur && <p className="m-0 text-[14px] text-[var(--destructive)]" role="alert">{erreur}</p>}

      {admin && (
        <Moderation
          etat={etat}
          sansDelai={sansDelai} setSansDelai={setSansDelai}
          modeZone={modeZone}
          setModeZone={m => { setModeZone(m); setCoins([]); }}
          zone={zone}
          couleur={couleur}
          info={selection && info && info.x === selection.x && info.y === selection.y ? info : null}
        />
      )}
    </div>
  );
}
