"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCompte, genererReel, type CommentaireReel, type Reel } from "@/lib/reels";

/*
 * Fil vertical plein écran façon « reels » : un réel par écran, défilement
 * aimanté, double tap pour aimer, commentaires en feuille basse. Les réels
 * sont tirés dans le navigateur après le montage (pas de rendu serveur :
 * le hasard différerait entre serveur et client). Rien n'est enregistré.
 */

const LOT = 6;

type Etat = { aime: boolean; suivi: boolean; ajoutes: CommentaireReel[] };

export function FilReels({ pseudo }: { pseudo: string }) {
  const [reels, setReels] = useState<Reel[]>([]);
  const [etats, setEtats] = useState<Record<string, Etat>>({});
  const [actif, setActif] = useState(0);
  const [commentaires, setCommentaires] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fil = useRef<HTMLDivElement>(null);

  const ajouterLot = useCallback(() => {
    setReels((r) => [...r, ...Array.from({ length: LOT }, () => genererReel(Math.random, pseudo))]);
  }, [pseudo]);

  useEffect(() => { ajouterLot(); }, [ajouterLot]);

  // Réel visible : celui qui occupe plus de la moitié du fil.
  useEffect(() => {
    const racine = fil.current;
    if (!racine) return;
    const obs = new IntersectionObserver((entrees) => {
      for (const e of entrees) {
        if (e.isIntersecting) setActif(Number((e.target as HTMLElement).dataset.index));
      }
    }, { root: racine, threshold: 0.6 });
    racine.querySelectorAll("[data-index]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [reels.length]);

  // Défilement infini : on prépare la suite trois réels avant la fin.
  useEffect(() => {
    if (reels.length > 0 && actif >= reels.length - 3) ajouterLot();
  }, [actif, reels.length, ajouterLot]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const etat = (id: string): Etat => etats[id] ?? { aime: false, suivi: false, ajoutes: [] };
  const modifier = (id: string, f: (e: Etat) => Partial<Etat>) =>
    setEtats((s) => { const e = s[id] ?? { aime: false, suivi: false, ajoutes: [] }; return { ...s, [id]: { ...e, ...f(e) } }; });

  async function partager(r: Reel) {
    const texte = `Regarde ce réel : ${r.valeur}${r.sous ? ` (${r.sous})` : ""}`;
    try {
      if (navigator.share) { await navigator.share({ text: texte }); return; }
      await navigator.clipboard.writeText(texte);
      setToast("Réel copié");
    } catch { /* partage annulé */ }
  }

  const ouvert = reels.find((r) => r.id === commentaires);

  return (
    <div className="reels">
      <header className="reels__haut">
        <Link href="/divertissement" aria-label="Retour au divertissement" className="reels__retour">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </Link>
        <h1 className="text-[20px] font-bold tracking-tight">Réels <span className="font-semibold opacity-70">ℝ</span></h1>
      </header>

      <div ref={fil} className="reels__fil" tabIndex={0} aria-label="Fil de réels">
        {reels.length === 0 && <div className="reels__ecran grid place-items-center"><span className="reels__chargement" /></div>}
        {reels.map((r, i) => (
          <EcranReel key={r.id} reel={r} index={i} actif={i === actif} etat={etat(r.id)}
                     onAimer={(force) => modifier(r.id, (e) => ({ aime: force ?? !e.aime }))}
                     onSuivre={() => modifier(r.id, (e) => ({ suivi: !e.suivi }))}
                     onCommentaires={() => setCommentaires(r.id)}
                     onPartager={() => partager(r)} />
        ))}
      </div>

      {ouvert && (
        <FeuilleCommentaires reel={ouvert} pseudo={pseudo} ajoutes={etat(ouvert.id).ajoutes}
                             onFermer={() => setCommentaires(null)}
                             onAjouter={(texte) => modifier(ouvert.id, (e) => ({
                               ajoutes: [{ id: `${ouvert.id}-m${e.ajoutes.length}`, auteur: pseudo, texte, likes: 0, ilYa: "à l’instant" }, ...e.ajoutes],
                             }))} />
      )}

      {toast && <p role="status" className="reels__toast">{toast}</p>}
    </div>
  );
}

function EcranReel({ reel, index, actif, etat, onAimer, onSuivre, onCommentaires, onPartager }: {
  reel: Reel; index: number; actif: boolean; etat: Etat;
  onAimer: (force?: boolean) => void; onSuivre: () => void; onCommentaires: () => void; onPartager: () => void;
}) {
  const dernierTap = useRef(0);
  const [coeur, setCoeur] = useState<{ x: number; y: number; k: number } | null>(null);

  function tap(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button, a")) return;
    const maintenant = e.timeStamp;
    if (maintenant - dernierTap.current < 300) {
      const b = e.currentTarget.getBoundingClientRect();
      setCoeur({ x: e.clientX - b.left, y: e.clientY - b.top, k: maintenant });
      onAimer(true);
      dernierTap.current = 0;
    } else {
      dernierTap.current = maintenant;
    }
  }

  const longueur = reel.valeur.length;
  const taille = longueur <= 3 ? 120 : longueur <= 6 ? 88 : longueur <= 10 ? 60 : longueur <= 14 ? 44 : 36;
  const likes = reel.likes + (etat.aime ? 1 : 0);

  return (
    <section data-index={index} className="reels__ecran" aria-roledescription="réel"
             aria-label={`Réel de ${reel.auteur} : ${reel.valeur}`}
             style={{ "--h": reel.teinte } as React.CSSProperties}
             onPointerUp={tap}>
      <div className="reels__nombre">
        <p className="tabular font-bold leading-[1.05] tracking-tight" style={{ fontSize: taille }}>{reel.valeur}</p>
        {reel.sous && <p className="mt-3 text-[22px] font-medium opacity-80 tabular">{reel.sous}</p>}
      </div>

      {coeur && (
        <svg key={coeur.k} className="reels__coeur-geant" style={{ left: coeur.x, top: coeur.y }}
             viewBox="0 0 24 24" width="110" height="110" aria-hidden="true" onAnimationEnd={() => setCoeur(null)}>
          <path d={COEUR} fill="#ff3040" />
        </svg>
      )}

      <div className="reels__actions">
        <Action label={etat.aime ? "Je n’aime plus" : "J’aime"} compte={likes} presse={etat.aime} onClick={() => onAimer()}>
          <path d={COEUR} fill={etat.aime ? "#ff3040" : "none"} stroke={etat.aime ? "#ff3040" : "currentColor"} />
        </Action>
        <Action label="Commentaires" compte={reel.nbCommentaires + etat.ajoutes.length} onClick={onCommentaires}>
          <path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5 5 16a8.5 8.5 0 1 1 15.5-4.5Z" fill="none" stroke="currentColor" />
        </Action>
        <Action label="Partager" compte={reel.partages} onClick={onPartager}>
          <path d="M21.5 3 10 14M21.5 3l-7 18-4.5-7-7-4.5z" fill="none" stroke="currentColor" />
        </Action>
      </div>

      <div className="reels__bas">
        <div className="flex items-center gap-2.5">
          <span className="reels__avatar" aria-hidden="true">{reel.auteur[0].toUpperCase()}</span>
          <span className="min-w-0 truncate text-[15px] font-semibold">{reel.auteur}</span>
          <button type="button" onClick={onSuivre} aria-pressed={etat.suivi}
                  className="reels__suivre">{etat.suivi ? "Suivi(e)" : "Suivre"}</button>
        </div>
        <p className="mt-2 text-[14px] leading-snug">{reel.legende}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[13px] opacity-90">
          <span aria-hidden="true">♪</span><span className="reels__son"><span>{reel.son}</span></span>
        </p>
      </div>

      <div className="reels__progression" aria-hidden="true"><span data-actif={actif || undefined} /></div>
    </section>
  );
}

const COEUR = "M12 20.5s-8.5-5-8.5-11A4.75 4.75 0 0 1 12 6.6a4.75 4.75 0 0 1 8.5 2.9c0 6-8.5 11-8.5 11Z";

function Action({ label, compte, presse, onClick, children }: {
  label: string; compte: number; presse?: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={`${label} (${compte})`} aria-pressed={presse}
            className="reels__action">
      <svg viewBox="0 0 24 24" width="30" height="30" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round"
           aria-hidden="true" className={presse ? "reels__pop" : undefined}>{children}</svg>
      <span className="text-[12px] font-semibold tabular">{formatCompte(compte)}</span>
    </button>
  );
}

function FeuilleCommentaires({ reel, pseudo, ajoutes, onFermer, onAjouter }: {
  reel: Reel; pseudo: string; ajoutes: CommentaireReel[];
  onFermer: () => void; onAjouter: (texte: string) => void;
}) {
  const [texte, setTexte] = useState("");
  const [aimes, setAimes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [onFermer]);

  const liste = [...ajoutes, ...reel.commentaires];

  // Portail vers <body> : la feuille doit passer au-dessus de la navigation basse.
  return createPortal(
    <div className="reels__voile" onClick={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="reels-commentaires" className="reels__feuille">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-[var(--border)]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 id="reels-commentaires" className="w-full text-center text-[15px] font-semibold">Commentaires</h2>
          <button type="button" onClick={onFermer} aria-label="Fermer"
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-[20px] hover:bg-[var(--muted)]">×</button>
        </div>
        <ul className="mt-3 flex-1 space-y-4 overflow-y-auto px-1 pb-2">
          {liste.map((c) => {
            const aime = aimes.has(c.id);
            return (
              <li key={c.id} className="flex gap-3">
                <span className="reels__avatar reels__avatar--petit" aria-hidden="true">{c.auteur[0].toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px]"><span className="font-semibold">{c.auteur}</span>
                    <span className="ml-2 text-[var(--muted-foreground)]">{c.ilYa}</span></p>
                  <p className="text-[14px] leading-snug [overflow-wrap:anywhere]">{c.texte}</p>
                </div>
                <button type="button" aria-pressed={aime} aria-label={`J’aime ce commentaire (${c.likes + (aime ? 1 : 0)})`}
                        onClick={() => setAimes((s) => { const n = new Set(s); if (aime) n.delete(c.id); else n.add(c.id); return n; })}
                        className="flex w-8 shrink-0 flex-col items-center text-[var(--muted-foreground)]">
                  <svg viewBox="0 0 24 24" width="16" height="16" strokeWidth="2" aria-hidden="true">
                    <path d={COEUR} fill={aime ? "#ff3040" : "none"} stroke={aime ? "#ff3040" : "currentColor"} />
                  </svg>
                  <span className="text-[11px] tabular">{formatCompte(c.likes + (aime ? 1 : 0))}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <form className="flex gap-2 border-t border-[var(--hairline)] pt-3"
              onSubmit={(e) => { e.preventDefault(); const t = texte.trim(); if (t) { onAjouter(t); setTexte(""); } }}>
          <input value={texte} onChange={(e) => setTexte(e.target.value)} maxLength={300}
                 placeholder={`Ajouter un commentaire en tant que ${pseudo}…`} aria-label="Ajouter un commentaire"
                 className="champ min-h-[44px] flex-1 rounded-full" />
          <button type="submit" disabled={!texte.trim()} className="lien-discret px-2 disabled:opacity-40">Publier</button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
