"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLIP_MIN_S, FILTRES, INTERLIGNE, TAILLES_TEXTE, TEXTES_MAX, TAILLE_MAX_VIDEO,
  couperTexte, filtreCss, formatDuree, hautDuBloc, type Montage, type TexteMontage,
} from "@/lib/videos-montage";
import type { Clip } from "./Studio";

/*
 * Éditeur de montage. Rien n'est réencodé dans le navigateur : l'aperçu
 * enchaîne les clips dans un seul <video>, imite le filtre en CSS et pose
 * les textes à l'échelle exacte de l'image finale (720×1280 ou 1280×720).
 * Le serveur refait la même chose avec ffmpeg à la publication.
 */

export type Segment = { cle: string; clip: string; debut: number; fin: number; muet: boolean };
export type TexteEdite = TexteMontage & { cle: string };
export type Reglages = { textes: TexteEdite[]; filtre: string; couverture: number };

type Onglet = "clips" | "texte" | "filtre" | "couverture";

const arrondi = (x: number) => Math.round(x * 10) / 10;
let n = 0;
const cle = () => `t${Date.now().toString(36)}${(n++).toString(36)}`;

export function Editeur({ clips, segments, setSegments, reglages, setReglages, matieres, onCamera, onQuitter }: {
  clips: Clip[];
  segments: Segment[];
  setSegments: React.Dispatch<React.SetStateAction<Segment[]>>;
  reglages: Reglages;
  setReglages: React.Dispatch<React.SetStateAction<Reglages>>;
  matieres: { id: number; nom: string }[];
  onCamera: () => void;
  onQuitter: () => void;
}) {
  const [etape, setEtape] = useState<"montage" | "publier">("montage");
  const [onglet, setOnglet] = useState<Onglet>("clips");
  const [choisi, setChoisi] = useState(0);
  const [texteChoisi, setTexteChoisi] = useState<string | null>(null);
  const parId = useMemo(() => new Map(clips.map((c) => [c.id, c])), [clips]);

  const debuts = useMemo(() => {
    const d: number[] = [];
    let s = 0;
    for (const x of segments) { d.push(s); s += x.fin - x.debut; }
    return d;
  }, [segments]);
  const total = segments.reduce((s, x) => s + (x.fin - x.debut), 0);

  const premier = parId.get(segments[0]?.clip);
  const [W, H] = premier && premier.largeur > premier.hauteur ? [1280, 720] : [720, 1280];

  const lecteur = useLecteur(segments, debuts, total, parId);
  const { t, placer } = lecteur;

  useEffect(() => { if (choisi >= segments.length) setChoisi(Math.max(0, segments.length - 1)); }, [segments.length, choisi]);

  const modifierSegment = (i: number, f: (s: Segment) => Segment) =>
    setSegments((l) => l.map((s, k) => (k === i ? f(s) : s)));

  function deplacer(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= segments.length) return;
    setSegments((l) => { const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c; });
    setChoisi(j);
  }

  function couper() {
    const i = choisi, s = segments[i];
    if (!s) return;
    const p = arrondi(s.debut + (t - debuts[i]));
    if (p - s.debut < CLIP_MIN_S || s.fin - p < CLIP_MIN_S) return;
    setSegments((l) => [...l.slice(0, i), { ...s, fin: p }, { ...s, cle: cle(), debut: p }, ...l.slice(i + 1)]);
    setChoisi(i + 1);
  }

  function supprimerSegment(i: number) {
    if (segments.length === 1) { onCamera(); return; }
    setSegments((l) => l.filter((_, k) => k !== i));
  }

  function ajouterTexte() {
    if (reglages.textes.length >= TEXTES_MAX) return;
    const debut = arrondi(Math.min(t, Math.max(0, total - 0.5)));
    const nouveau: TexteEdite = {
      cle: cle(), texte: "", debut, fin: arrondi(Math.min(total, debut + 4)),
      position: "bas", taille: "m", fond: true,
    };
    setReglages((r) => ({ ...r, textes: [...r.textes, nouveau] }));
    setTexteChoisi(nouveau.cle);
  }
  const modifierTexte = (k: string, p: Partial<TexteEdite>) =>
    setReglages((r) => ({ ...r, textes: r.textes.map((x) => (x.cle === k ? { ...x, ...p } : x)) }));

  if (etape === "publier") {
    return <Publication clips={clips} segments={segments} reglages={reglages} total={total} W={W} H={H}
                        matieres={matieres} onRetour={() => setEtape("montage")} />;
  }

  const seg = segments[choisi];
  const clipChoisi = seg ? parId.get(seg.clip) : undefined;
  const texte = reglages.textes.find((x) => x.cle === texteChoisi);
  const textesVisibles = reglages.textes.filter((x) => x.texte.trim());

  return (
    <div className="studio studio--montage">
      <header className="editeur__haut">
        <button type="button" className="studio__icone" onClick={onQuitter} aria-label="Abandonner la vidéo">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <h1 className="text-[17px] font-semibold">Montage</h1>
        <button type="button" className="studio__suivant" disabled={total < 1}
                onClick={() => { lecteur.pause(); setEtape("publier"); }}>
          Suivant
        </button>
      </header>

      <Scene W={W} H={H} filtre={reglages.filtre} textes={textesVisibles} t={t} videoRef={lecteur.ref}
             onToucher={lecteur.basculer} lecture={lecteur.lecture} />

      <div className="editeur__transport">
        <button type="button" className="studio__icone" onClick={lecteur.basculer}
                aria-label={lecteur.lecture ? "Pause" : "Lire"}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            {lecteur.lecture ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" /> : <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />}
          </svg>
        </button>
        <span className="tabular w-[92px] text-[13px]">{formatDuree(t)} / {formatDuree(total)}</span>
        <Frise segments={segments} debuts={debuts} total={total} t={t} choisi={choisi}
               onPlacer={(x) => placer(x, false)} onChoisir={setChoisi} />
      </div>

      <nav className="editeur__onglets" aria-label="Outils de montage">
        {([["clips", "Clips"], ["texte", "Texte"], ["filtre", "Filtre"], ["couverture", "Couverture"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={onglet === k} onClick={() => setOnglet(k)}>{l}</button>
        ))}
      </nav>

      <div className="editeur__panneau">
        {onglet === "clips" && seg && clipChoisi && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {segments.map((s, i) => (
                <button key={s.cle} type="button" aria-pressed={i === choisi}
                        className="editeur__puce" onClick={() => { setChoisi(i); placer(debuts[i], false); }}>
                  <span className="font-semibold">{i + 1}</span>
                  <span className="tabular opacity-80">{(s.fin - s.debut).toFixed(1)} s</span>
                  {s.muet && <span aria-label="sans son">🔇</span>}
                </button>
              ))}
              <button type="button" className="editeur__puce editeur__puce--ajout" onClick={onCamera}
                      disabled={total >= 179}>+ Filmer</button>
            </div>

            <Plage libelle={`Clip ${choisi + 1} — garder de ${seg.debut.toFixed(1)} s à ${seg.fin.toFixed(1)} s`}
                   max={clipChoisi.duree} debut={seg.debut} fin={seg.fin}
                   onChange={(debut, fin) => {
                     modifierSegment(choisi, (s) => ({ ...s, debut, fin }));
                     placer(debuts[choisi] + (debut !== seg.debut ? 0 : Math.max(0, fin - debut - 0.1)), false);
                   }} />

            <div className="grid grid-cols-3 gap-2">
              <Outil onClick={couper} libelle="Couper ici"
                     disabled={!(t > debuts[choisi] + CLIP_MIN_S && t < debuts[choisi] + seg.fin - seg.debut - CLIP_MIN_S)}>
                <path d="M6 4v16M18 4v16M12 3v18" strokeDasharray="2 2.5" />
              </Outil>
              <Outil onClick={() => deplacer(choisi, -1)} libelle="Avant" disabled={choisi === 0}><path d="m14 6-6 6 6 6" /></Outil>
              <Outil onClick={() => deplacer(choisi, 1)} libelle="Après" disabled={choisi === segments.length - 1}><path d="m10 6 6 6-6 6" /></Outil>
              <Outil onClick={() => modifierSegment(choisi, (s) => ({ ...s, muet: !s.muet }))}
                     libelle={seg.muet ? "Remettre le son" : "Couper le son"} presse={seg.muet}>
                <path d="M4 9v6h4l5 4V5L8 9z" />{seg.muet ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7" />}
              </Outil>
              <Outil onClick={() => supprimerSegment(choisi)} libelle="Supprimer" danger>
                <path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" />
              </Outil>
              <Outil onClick={() => modifierSegment(choisi, (s) => ({ ...s, debut: 0, fin: clipChoisi.duree }))}
                     libelle="Clip entier" disabled={seg.debut === 0 && seg.fin === clipChoisi.duree}>
                <path d="M4 12h16M4 8v8M20 8v8" />
              </Outil>
            </div>
            <p className="text-[12px] opacity-70">« Couper ici » sépare le clip à la tête de lecture : placez-la sur la frise.</p>
          </div>
        )}

        {onglet === "texte" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {reglages.textes.map((x, i) => (
                <button key={x.cle} type="button" className="editeur__puce max-w-[46%]" aria-pressed={x.cle === texteChoisi}
                        onClick={() => { setTexteChoisi(x.cle); placer(x.debut, false); }}>
                  <span className="truncate">{x.texte.trim() || `Texte ${i + 1}`}</span>
                </button>
              ))}
              <button type="button" className="editeur__puce editeur__puce--ajout" onClick={ajouterTexte}
                      disabled={reglages.textes.length >= TEXTES_MAX}>+ Texte</button>
            </div>
            {texte ? (
              <div className="space-y-3">
                <textarea value={texte.texte} maxLength={120} rows={2} autoFocus
                          onChange={(e) => modifierTexte(texte.cle, { texte: e.target.value })}
                          placeholder="Ex. : Théorème de Rolle — hypothèses"
                          className="editeur__champ w-full resize-none" aria-label="Texte affiché" />
                <Choix libelle="Position" valeur={texte.position}
                       options={[["haut", "Haut"], ["milieu", "Milieu"], ["bas", "Bas"]]}
                       onChange={(v) => modifierTexte(texte.cle, { position: v })} />
                <Choix libelle="Taille" valeur={texte.taille}
                       options={[["s", "Petit"], ["m", "Moyen"], ["l", "Grand"]]}
                       onChange={(v) => modifierTexte(texte.cle, { taille: v })} />
                <Choix libelle="Style" valeur={texte.fond ? "fond" : "ombre"}
                       options={[["fond", "Bandeau"], ["ombre", "Ombre"]]}
                       onChange={(v) => modifierTexte(texte.cle, { fond: v === "fond" })} />
                <Plage libelle={`Affiché de ${formatDuree(texte.debut)} à ${formatDuree(Math.min(texte.fin, total))}`}
                       max={total} debut={Math.min(texte.debut, total)} fin={Math.min(texte.fin, total)}
                       onChange={(debut, fin) => { modifierTexte(texte.cle, { debut, fin }); placer(debut, false); }} />
                <button type="button" className="text-[14px] text-[#ff6b6b]"
                        onClick={() => { setReglages((r) => ({ ...r, textes: r.textes.filter((x) => x.cle !== texte.cle) })); setTexteChoisi(null); }}>
                  Supprimer ce texte
                </button>
              </div>
            ) : (
              <p className="text-[13px] opacity-70">
                Ajoutez un titre, une formule clé ou une étape. Il apparaît à la tête de lecture pendant 4 s ; réglez ensuite sa durée.
              </p>
            )}
          </div>
        )}

        {onglet === "filtre" && (
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(FILTRES).map(([k, f]) => (
              <button key={k} type="button" aria-pressed={reglages.filtre === k} className="editeur__filtre"
                      onClick={() => setReglages((r) => ({ ...r, filtre: k }))}>
                <span className="editeur__echantillon" style={{ filter: filtreCss(k) }} aria-hidden="true" />
                <span className="text-[13px]">{f.libelle}</span>
              </button>
            ))}
          </div>
        )}

        {onglet === "couverture" && (
          <div className="space-y-3">
            <label className="block text-[14px]">
              Image de couverture à {formatDuree(Math.min(reglages.couverture, total))}
              <input type="range" className="editeur__curseur mt-2 w-full" min={0} max={Math.max(0.1, total - 0.2)} step={0.1}
                     value={Math.min(reglages.couverture, total)}
                     onChange={(e) => { const v = Number(e.target.value); setReglages((r) => ({ ...r, couverture: v })); placer(v, false); }} />
            </label>
            <p className="text-[13px] opacity-70">La vignette de la galerie. Choisissez une image où l’on voit le sujet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* --- Lecteur : enchaîne les segments dans un seul élément <video> --- */

function useLecteur(segments: Segment[], debuts: number[], total: number, parId: Map<string, Clip>) {
  const ref = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [lecture, setLecture] = useState(false);
  const courant = useRef(0);
  const jeton = useRef(0);
  const etat = useRef({ segments, debuts, total, parId });
  etat.current = { segments, debuts, total, parId };

  const placer = useCallback(async (x: number, jouer: boolean) => {
    const el = ref.current;
    const { segments, debuts, total, parId } = etat.current;
    if (!el || segments.length === 0) return;
    const pos = Math.max(0, Math.min(x, total - 0.01));
    let i = debuts.findLastIndex((d) => d <= pos);
    if (i < 0) i = 0;
    const s = segments[i];
    const clip = parId.get(s.clip);
    if (!clip) return;
    const mon = ++jeton.current;
    courant.current = i;
    setT(pos);
    if (el.src !== clip.url) {
      el.src = clip.url;
      await new Promise<void>((ok) => {
        const fini = () => { el.removeEventListener("loadedmetadata", fini); ok(); };
        el.addEventListener("loadedmetadata", fini);
        setTimeout(fini, 3000);
      });
      if (mon !== jeton.current) return;
    }
    el.muted = s.muet;
    try { el.currentTime = s.debut + (pos - debuts[i]); } catch { /* métadonnées pas prêtes */ }
    if (jouer) await el.play().catch(() => setLecture(false));
    else el.pause();
  }, []);

  // Pendant la lecture : avance la frise et saute au segment suivant.
  useEffect(() => {
    if (!lecture) return;
    let id = 0;
    const pas = () => {
      const el = ref.current;
      const { segments, debuts, total } = etat.current;
      const i = courant.current, s = segments[i];
      if (el && s && !el.seeking) {
        const fin = el.currentTime >= s.fin - 0.04 || el.ended;
        if (fin) {
          if (i + 1 < segments.length) placer(debuts[i + 1], true);
          else { el.pause(); setLecture(false); setT(total); }
        } else {
          setT(Math.max(debuts[i], debuts[i] + el.currentTime - s.debut));
        }
      }
      id = requestAnimationFrame(pas);
    };
    id = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(id);
  }, [lecture, placer]);

  // Premier affichage, et après toute modification de la liste.
  useEffect(() => { placer(Math.min(t, total), false); setLecture(false); }, [segments]); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = useCallback(() => { ref.current?.pause(); setLecture(false); }, []);
  const basculer = useCallback(() => {
    if (lecture) { pause(); return; }
    setLecture(true);
    placer(t >= total - 0.05 ? 0 : t, true);
  }, [lecture, pause, placer, t, total]);

  return { ref, t, lecture, placer, pause, basculer };
}

/* --- Scène : vidéo + filtre CSS + textes à l'échelle de l'export ---- */

function Scene({ W, H, filtre, textes, t, videoRef, onToucher, lecture }: {
  W: number; H: number; filtre: string; textes: TexteEdite[]; t: number;
  videoRef: React.RefObject<HTMLVideoElement | null>; onToucher: () => void; lecture: boolean;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [echelle, setEchelle] = useState(0);
  useEffect(() => {
    const el = boite.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setEchelle(el.clientWidth / W));
    obs.observe(el);
    return () => obs.disconnect();
  }, [W]);

  return (
    <div className="editeur__scene-zone">
      <div ref={boite} className="editeur__scene" onClick={onToucher}
           style={{ aspectRatio: `${W} / ${H}`, height: W > H ? "auto" : "100%", width: W > H ? "100%" : "auto" }}>
        <video ref={videoRef} playsInline preload="auto" style={{ filter: filtreCss(filtre) }} />
        <div className="editeur__calque" style={{ width: W, height: H, transform: `scale(${echelle})` }} aria-hidden="true">
          {textes.filter((x) => t >= x.debut && t <= x.fin).map((x) => <TexteRendu key={x.cle} texte={x} W={W} H={H} />)}
        </div>
        {!lecture && (
          <span className="editeur__lire" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="44" height="44"><path d="M8 5.5v13l10.5-6.5z" fill="#fff" /></svg>
          </span>
        )}
      </div>
    </div>
  );
}

/* Même géométrie que le drawtext du serveur (videos-rendu.ts). */
function TexteRendu({ texte, W, H }: { texte: TexteMontage; W: number; H: number }) {
  const cote = Math.min(W, H);
  const lignes = couperTexte(texte.texte, texte.taille, W, cote);
  const f = Math.round(cote * TAILLES_TEXTE[texte.taille]);
  const pas = f * INTERLIGNE;
  const haut = hautDuBloc(texte.position, lignes.length * pas, H);
  return (
    <>
      {lignes.map((l, j) => (
        <span key={j} className="editeur__ligne" data-fond={texte.fond || undefined}
              style={{ top: Math.round(haut + j * pas + (pas - f) / 2), fontSize: f, lineHeight: `${f}px`,
                       padding: texte.fond ? `${Math.round(f * 0.28)}px` : 0,
                       marginTop: texte.fond ? -Math.round(f * 0.28) : 0 }}>
          {l}
        </span>
      ))}
    </>
  );
}

/* --- Frise : segments proportionnels et tête de lecture ------------ */

function Frise({ segments, debuts, total, t, choisi, onPlacer, onChoisir }: {
  segments: Segment[]; debuts: number[]; total: number; t: number; choisi: number;
  onPlacer: (t: number) => void; onChoisir: (i: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const glisse = useRef(false);
  function position(e: React.PointerEvent) {
    const b = ref.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) * total;
    onPlacer(x);
    const i = debuts.findLastIndex((d) => d <= x);
    if (i >= 0) onChoisir(i);
  }
  return (
    <div ref={ref} className="editeur__frise" role="slider" tabIndex={0} aria-label="Tête de lecture"
         aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(t)}
         aria-valuetext={formatDuree(t)}
         onKeyDown={(e) => {
           if (e.key === "ArrowRight") onPlacer(Math.min(total, t + 1));
           if (e.key === "ArrowLeft") onPlacer(Math.max(0, t - 1));
         }}
         onPointerDown={(e) => { glisse.current = true; e.currentTarget.setPointerCapture(e.pointerId); position(e); }}
         onPointerMove={(e) => { if (glisse.current) position(e); }}
         onPointerUp={() => { glisse.current = false; }}>
      {segments.map((s, i) => (
        <span key={s.cle} data-choisi={i === choisi || undefined}
              style={{ left: `${(debuts[i] / total) * 100}%`, width: `${((s.fin - s.debut) / total) * 100}%` }} />
      ))}
      <i style={{ left: `${(t / Math.max(total, 0.01)) * 100}%` }} />
    </div>
  );
}

/* --- Petites commandes --------------------------------------------- */

function Plage({ libelle, max, debut, fin, onChange }: {
  libelle: string; max: number; debut: number; fin: number; onChange: (debut: number, fin: number) => void;
}) {
  const m = Math.max(max, CLIP_MIN_S);
  return (
    <fieldset className="editeur__plage">
      <legend className="text-[13px]">{libelle}</legend>
      <div className="relative h-10">
        <span className="editeur__plage-fond" />
        <span className="editeur__plage-garde" style={{ left: `${(debut / m) * 100}%`, right: `${100 - (fin / m) * 100}%` }} />
        <input type="range" min={0} max={m} step={0.1} value={debut} aria-label="Début"
               onChange={(e) => onChange(Math.min(Number(e.target.value), arrondi(fin - CLIP_MIN_S)), fin)} />
        <input type="range" min={0} max={m} step={0.1} value={fin} aria-label="Fin"
               onChange={(e) => onChange(debut, Math.max(Number(e.target.value), arrondi(debut + CLIP_MIN_S)))} />
      </div>
    </fieldset>
  );
}

function Outil({ onClick, libelle, disabled, presse, danger, children }: {
  onClick: () => void; libelle: string; disabled?: boolean; presse?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={presse}
            className={`editeur__outil ${danger ? "text-[#ff6b6b]" : ""}`}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
      <span>{libelle}</span>
    </button>
  );
}

function Choix<T extends string>({ libelle, valeur, options, onChange }: {
  libelle: string; valeur: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[13px] opacity-80">{libelle}</span>
      <div className="editeur__segments" role="radiogroup" aria-label={libelle}>
        {options.map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={valeur === v} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/* --- Publication ---------------------------------------------------- */

export function montageAEnvoyer(clips: Clip[], segments: Segment[], reglages: Reglages, total: number) {
  const utilises: Clip[] = [];
  const index = new Map<string, number>();
  for (const s of segments) {
    if (!index.has(s.clip)) {
      const c = clips.find((x) => x.id === s.clip);
      if (!c) continue;
      index.set(s.clip, utilises.length);
      utilises.push(c);
    }
  }
  const montage: Montage = {
    clips: segments.filter((s) => index.has(s.clip))
      .map((s) => ({ source: index.get(s.clip)!, debut: arrondi(s.debut), fin: arrondi(s.fin), muet: s.muet })),
    filtre: reglages.filtre,
    textes: reglages.textes.filter((x) => x.texte.trim() && x.debut < total)
      .map(({ texte, debut, fin, position, taille, fond }) => ({
        texte: texte.trim(), debut, fin: Math.min(fin, total), position, taille, fond,
      })),
    couverture: Math.min(reglages.couverture, Math.max(0, total - 0.2)),
  };
  return { utilises, montage };
}

function Publication({ clips, segments, reglages, total, W, H, matieres, onRetour }: {
  clips: Clip[]; segments: Segment[]; reglages: Reglages; total: number; W: number; H: number;
  matieres: { id: number; nom: string }[]; onRetour: () => void;
}) {
  const router = useRouter();
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [matiere, setMatiere] = useState("");
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { utilises, montage } = useMemo(() => montageAEnvoyer(clips, segments, reglages, total), [clips, segments, reglages, total]);
  const poids = utilises.reduce((s, c) => s + c.blob.size, 0);
  const tropLourd = poids > TAILLE_MAX_VIDEO;

  function publier(e: React.FormEvent) {
    e.preventDefault();
    if (!titre.trim() || progression !== null || tropLourd) return;
    const form = new FormData();
    form.set("titre", titre.trim());
    form.set("description", description.trim());
    form.set("matiere", matiere);
    form.set("montage", JSON.stringify(montage));
    utilises.forEach((c, i) => form.append("clips", c.blob, `clip-${i}.${c.blob.type.includes("mp4") ? "mp4" : "webm"}`));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/videos");
    xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgression(ev.loaded / ev.total); };
    xhr.onload = () => {
      let r: { ok?: boolean; erreur?: string } = {};
      try { r = JSON.parse(xhr.responseText); } catch { /* réponse non JSON (nginx) */ }
      if (xhr.status === 200 && r.ok) {
        window.onbeforeunload = null;
        router.replace("/divertissement/videos");
        router.refresh();
      } else {
        setProgression(null);
        setErreur(r.erreur ?? (xhr.status === 413 ? "Vidéo trop lourde." : "Envoi impossible, réessayez."));
      }
    };
    xhr.onerror = () => { setProgression(null); setErreur("Connexion perdue pendant l’envoi. Réessayez."); };
    setErreur(null);
    setProgression(0);
    xhr.send(form);
  }

  return (
    <div className="studio studio--montage">
      <header className="editeur__haut">
        <button type="button" className="studio__icone" onClick={onRetour} disabled={progression !== null} aria-label="Retour au montage">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <h1 className="text-[17px] font-semibold">Publier</h1>
        <span className="w-11" />
      </header>
      <form onSubmit={publier} className="editeur__formulaire">
        <p className="text-[13px] opacity-75">
          {formatDuree(total)} · {segments.length} clip{segments.length > 1 ? "s" : ""} · {W > H ? "paysage" : "portrait"} · {(poids / 1048576).toFixed(1).replace(".", ",")} Mo à envoyer
        </p>
        <label className="block">
          <span className="text-[14px] font-medium">Titre</span>
          <input value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} required autoFocus
                 placeholder="Ex. : Comprendre les séries géométriques" className="editeur__champ mt-1 w-full" />
        </label>
        <label className="block">
          <span className="text-[14px] font-medium">Description <span className="opacity-60">(facultatif)</span></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3}
                    placeholder="Ce que la vidéo explique, le chapitre, l’exercice…" className="editeur__champ mt-1 w-full resize-none" />
        </label>
        <label className="block">
          <span className="text-[14px] font-medium">Matière</span>
          <select value={matiere} onChange={(e) => setMatiere(e.target.value)} className="editeur__champ mt-1 w-full">
            <option value="">Sans matière</option>
            {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
          </select>
        </label>
        {tropLourd && <p role="alert" className="text-[14px] text-[#ff6b6b]">Plus de 90 Mo de clips : raccourcissez ou retirez un clip.</p>}
        {erreur && <p role="alert" className="text-[14px] text-[#ff6b6b]">{erreur}</p>}
        {progression !== null && (
          <div>
            <div className="studio__jauge"><span style={{ width: `${progression * 100}%` }} /></div>
            <p className="mt-2 text-[13px] opacity-80">
              {progression < 1 ? `Envoi… ${Math.round(progression * 100)} %` : "Envoyé, préparation du montage…"}
            </p>
          </div>
        )}
        <button type="submit" disabled={!titre.trim() || progression !== null || tropLourd}
                className="bouton-principal h-12 w-full">
          Publier pour la classe
        </button>
        <p className="text-[12px] opacity-65">
          Le serveur assemble la vidéo (quelques minutes). Elle apparaît dans la galerie dès qu’elle est prête ; vous pouvez fermer l’app en attendant.
        </p>
      </form>
    </div>
  );
}
