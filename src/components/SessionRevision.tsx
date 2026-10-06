"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { carteSuivante, reviserCarte, signalerCarte, type CarteRendue } from "@/lib/actions-fiches";

/*
 * Session de révision : une carte à la fois, une seule action visible.
 *
 * Le client ne calcule aucune date. Les intervalles affichés sous les
 * quatre notes arrivent du serveur avec la carte, et la note envoyée
 * repart au serveur qui applique FSRS dans une transaction.
 *
 * Carte à plusieurs trous : chaque appui (ou Espace) révèle UN trou tiré
 * au hasard parmi ceux encore masqués ; une fois tous les trous ouverts,
 * la carte est révélée et les notes apparaissent.
 *
 * Commandes : Espace / Entrée révèlent, puis 1-4 notent.
 */

export function SessionRevision({
  carteInitiale, deckId, deckSlug, deckTitre,
}: {
  carteInitiale: CarteRendue | null;
  deckId: number;
  deckSlug: string;
  deckTitre: string;
}) {
  const router = useRouter();
  const [carte, setCarte] = useState<CarteRendue | null>(carteInitiale);
  const [revele, setRevele] = useState(false);
  const [ouverts, setOuverts] = useState<number[]>([]);
  const [faites, setFaites] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fini, setFini] = useState(carteInitiale === null);
  const debutRef = useRef<number>(Date.now());
  const rectoRef = useRef<HTMLDivElement>(null);

  // Remis à zéro à chaque nouvelle carte, pour mesurer le temps de réponse.
  useEffect(() => { debutRef.current = Date.now(); }, [carte?.cardId]);

  const restant = carte
    ? carte.restant.nouvelles + carte.restant.apprentissage + carte.restant.a_revoir
    : 0;
  const total = faites + restant;
  const progression = total > 0 ? faites / total : 1;

  // Révélation mot par mot : seulement s'il y a au moins deux trous.
  const trous = carte?.trousHtml ?? [];
  const parTrou = trous.length >= 2;
  const masques = parTrou ? trous.length - ouverts.length : 0;

  /* Les trous ouverts sont remplis dans le HTML déjà rendu (produit et
   * échappé par le serveur), sans re-rendre la carte entière. */
  useEffect(() => {
    const racine = rectoRef.current;
    if (!racine || revele || !parTrou) return;
    for (const i of ouverts) {
      const span = racine.querySelector<HTMLElement>(`[data-trou="${i}"]`);
      if (span && !span.classList.contains("trou-revele")) {
        span.innerHTML = trous[i];
        span.classList.add("trou-revele");
      }
    }
  }, [ouverts, revele, parTrou, trous]);

  const avancer = useCallback(() => {
    if (revele) return;
    if (!parTrou) { setRevele(true); return; }
    const restants = trous.map((_, i) => i).filter((i) => !ouverts.includes(i));
    if (restants.length <= 1) { setRevele(true); return; }
    const tire = restants[Math.floor(Math.random() * restants.length)];
    setOuverts((o) => [...o, tire]);
  }, [revele, parTrou, trous, ouverts]);

  const noter = useCallback(async (cle: string) => {
    if (!carte || enCours) return;
    setEnCours(true);
    setErreur(null);

    const r = await reviserCarte(carte.cardId, cle, carte.jeton, Date.now() - debutRef.current);
    if (!r.ok) {
      setErreur(r.erreur);
      setEnCours(false);
      return;
    }
    setFaites((n) => n + 1);

    const suivante = await carteSuivante(deckId);
    if (!suivante.ok) {
      setErreur(suivante.erreur + " — rechargez la page pour continuer.");
      setCarte(null);
      setEnCours(false);
      return;
    }
    if (suivante.data === null) {
      setFini(true);
      setCarte(null);
      router.refresh();   // les compteurs du paquet se remettent à jour
    } else {
      setCarte(suivante.data);
      setRevele(false);
      setOuverts([]);
    }
    setEnCours(false);
  }, [carte, enCours, deckId, router]);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return;

      if (!revele && (e.key === " " || e.key === "Enter")) {
        // Sur un bouton ou un lien, laisser l'activation native agir.
        if (cible && /^(BUTTON|A)$/.test(cible.tagName)) return;
        e.preventDefault();
        avancer();
        return;
      }
      if (revele && carte) {
        const index = ["1", "2", "3", "4"].indexOf(e.key);
        if (index >= 0) {
          e.preventDefault();
          void noter(carte.apercu[index].cle);
        }
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [revele, carte, noter, avancer]);

  if (fini) {
    return (
      <div className="flex min-h-[60dvh] flex-col justify-center gap-8">
        <div>
          <h1 className="titre-page">Session terminée</h1>
          <p className="mt-3 text-[17px] text-[var(--muted-foreground)]">
            {faites > 0
              ? `${faites} carte${faites > 1 ? "s" : ""} révisée${faites > 1 ? "s" : ""} — ${deckTitre}.`
              : "Rien à réviser dans ce paquet pour le moment."}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link href="/" className="bouton-principal">Retour à l’accueil</Link>
          <Link href={`/fiches/${deckSlug}`} className="lien-discret justify-center">Voir le paquet</Link>
        </div>
      </div>
    );
  }

  if (!carte) {
    return (
      <div role="alert" className="py-6">
        <p>{erreur}</p>
        <button onClick={() => window.location.reload()} className="lien-discret mt-3">Recharger</button>
      </div>
    );
  }

  return (
    <div className="-mt-6 flex min-h-[calc(100dvh-var(--bottom-nav-clearance)-1rem)] flex-col md:-mt-12">
      <header className="-ml-3 flex items-center gap-2">
        <Link href={`/fiches/${deckSlug}`} aria-label="Quitter la session"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-[var(--muted)]">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </Link>
        <div className="barre flex-1" role="progressbar" aria-label="Progression de la session"
             aria-valuemin={0} aria-valuemax={total} aria-valuenow={faites}>
          <span className="transition-[width] duration-300"
                style={{ width: `${progression * 100}%`, background: "var(--primary)" }} />
        </div>
        <span className="min-w-[52px] text-right text-[13px] text-[var(--muted-foreground)]">
          {Math.min(faites + 1, total)} / {total}
        </span>
      </header>

      {/* La carte. Un appui n'importe où révèle (un trou, ou la réponse). */}
      <div
        onClick={avancer}
        className={`flex flex-1 flex-col justify-center gap-7 py-10 ${revele ? "" : "cursor-pointer"}`}
      >
        <p className="text-[13px] text-[var(--muted-foreground)]">
          {deckTitre}{carte.nouvelle ? " · nouvelle carte" : ""}
        </p>

        <div ref={rectoRef}
             key={`${carte.cardId}-${revele ? "answer" : "question"}`}
             className="revision-face contenu-carte text-[24px] font-medium leading-snug tracking-[-0.01em]"
             dangerouslySetInnerHTML={{ __html: revele ? carte.rectoReveleHtml : carte.rectoHtml }} />

        {revele && carte.versoHtml && (
          <div className="flex flex-col gap-7">
            <div className="h-px w-10 bg-[var(--border)]" />
            <div className="revision-face contenu-carte text-[19px] leading-relaxed"
                 dangerouslySetInnerHTML={{ __html: carte.versoHtml }} />
          </div>
        )}

        {carte.signalee && (
          <p className="text-[13px] font-medium text-[var(--destructive)]">
            Cette carte a été signalée — vérifiez son contenu.
          </p>
        )}
      </div>

      {erreur && (
        <p role="alert" className="mb-3 text-[14px] font-medium text-[var(--destructive)]">{erreur}</p>
      )}

      <div className="sticky bottom-[var(--bottom-nav-clearance)] bg-[var(--background)] pb-2 pt-3">
        {revele ? (
          <div className="grid grid-cols-4 gap-2">
            {carte.apercu.map((a) => (
              <button
                key={a.cle}
                type="button"
                disabled={enCours}
                onClick={() => void noter(a.cle)}
                aria-keyshortcuts={a.touche}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)]
                            disabled:opacity-40 ${a.cle === "good"
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"}`}
              >
                <span className="text-[14px] font-semibold">{a.label}</span>
                <span className="text-[12px] opacity-80">{a.intervalle}</span>
              </button>
            ))}
          </div>
        ) : (
          <button type="button" onClick={avancer} className="bouton-principal bouton-sombre h-[60px]">
            {parTrou
              ? `Révéler un mot · ${masques} restant${masques > 1 ? "s" : ""}`
              : "Afficher la réponse"}
          </button>
        )}

        <div className="mt-2 flex items-center justify-between text-[13px] text-[var(--muted-foreground)]">
          <span className="hidden md:inline">{revele ? "Touches 1 à 4" : "Espace pour révéler"}</span>
          {!revele && parTrou ? (
            <button type="button" onClick={() => setRevele(true)} className="lien-discret">
              Tout afficher
            </button>
          ) : <span />}
          <BoutonSignaler cardId={carte.cardId} />
        </div>
      </div>
    </div>
  );
}

/** Signalement d'une carte fausse, sans quitter la session. */
function BoutonSignaler({ cardId }: { cardId: number }) {
  const [envoye, setEnvoye] = useState(false);

  if (envoye) return <span className="py-3">Signalée, merci</span>;
  return (
    <button
      type="button"
      onClick={async () => {
        const motif = window.prompt("Qu’est-ce qui ne va pas sur cette carte ?");
        if (!motif || motif.trim().length < 3) return;
        const r = await signalerCarte(cardId, motif);
        if (r.ok) setEnvoye(true);
        else window.alert(r.erreur);
      }}
      className="min-h-11 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
    >
      Signaler
    </button>
  );
}
