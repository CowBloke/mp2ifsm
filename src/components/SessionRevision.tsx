"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { carteSuivante, reviserCarte, signalerCarte, type CarteRendue } from "@/lib/actions-fiches";

/*
 * Session de révision : une carte à la fois.
 *
 * Le client ne calcule aucune date. Les intervalles affichés au-dessus
 * des quatre boutons arrivent du serveur avec la carte, et la note
 * envoyée repart au serveur qui applique FSRS dans une transaction.
 *
 * Commandes : Espace / Entrée révèlent, puis 1-4 notent.
 */

const COULEURS: Record<string, string> = {
  again: "var(--outcome-2)",
  hard:  "var(--outcome-4)",
  good:  "var(--outcome-1)",
  easy:  "var(--outcome-3)",
};

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
  const [faites, setFaites] = useState(0);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fini, setFini] = useState(carteInitiale === null);
  const [dernierIntervalle, setDernierIntervalle] = useState<string | null>(null);
  const debutRef = useRef<number>(Date.now());

  // Remis à zéro à chaque nouvelle carte, pour mesurer le temps de réponse.
  useEffect(() => { debutRef.current = Date.now(); }, [carte?.cardId]);

  const restant = carte
    ? carte.restant.nouvelles + carte.restant.apprentissage + carte.restant.a_revoir
    : 0;
  const progression = faites + restant > 0 ? faites / (faites + restant) : 1;

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
    setDernierIntervalle(r.data.intervalle);
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
    }
    setEnCours(false);
  }, [carte, enCours, deckId, router]);

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName)) return;

      if (!revele && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevele(true);
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
  }, [revele, carte, noter]);

  if (fini) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
             style={{ background: "color-mix(in oklab, var(--outcome-1) 15%, transparent)" }}>
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="var(--outcome-1)"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-4 text-[19px] font-bold">Session terminée</h1>
        <p className="mt-1 text-[14px] text-[var(--muted-foreground)]">
          {faites > 0
            ? `${faites} carte${faites > 1 ? "s" : ""} révisée${faites > 1 ? "s" : ""} — ${deckTitre}.`
            : "Rien à réviser dans ce paquet pour le moment."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href={`/fiches/${deckSlug}`}
                className="rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3.5 text-[14px]
                           font-semibold text-[var(--primary-foreground)]">
            Retour au paquet
          </Link>
          <Link href="/fiches"
                className="rounded-[var(--radius-md)] border px-4 py-3.5 text-[14px] font-medium">
            Tous les paquets
          </Link>
        </div>
      </div>
    );
  }

  if (!carte) return <div role="alert" className="py-6">
    <p>{erreur}</p><button onClick={() => window.location.reload()} className="mt-3 underline">Recharger</button>
  </div>;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col">
      {/* Progression + reste à faire */}
      <div className="pt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]"
             role="progressbar" aria-valuenow={Math.round(progression * 100)}
             aria-valuemin={0} aria-valuemax={100} aria-label="Progression de la session">
          <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300"
               style={{ width: `${progression * 100}%` }} />
        </div>

        <div className="tabular mt-2 flex items-center justify-between text-[11px]">
          <span className="flex gap-2.5">
            <Compteur n={carte.restant.nouvelles} couleur="var(--outcome-3)" titre="nouvelles" />
            <Compteur n={carte.restant.apprentissage} couleur="var(--outcome-2)" titre="en apprentissage" />
            <Compteur n={carte.restant.a_revoir} couleur="var(--outcome-1)" titre="à revoir" />
          </span>
          <span className="text-[var(--muted-foreground)]">
            {faites} faite{faites > 1 ? "s" : ""}
            {dernierIntervalle && ` · dernière : ${dernierIntervalle}`}
          </span>
        </div>
      </div>

      {/* La carte. Un appui n'importe où révèle le verso. */}
      <button
        type="button"
        onClick={() => !revele && setRevele(true)}
        aria-label={revele ? "Carte révélée" : "Révéler la réponse"}
        className={`mt-3 flex-1 rounded-[var(--radius-lg)] border bg-[var(--card)] p-5 text-left
                    ${revele ? "cursor-default" : "cursor-pointer active:scale-[0.995]"}`}
      >
        <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
          <span>{carte.nouvelle ? "Nouvelle carte" : "Révision"}</span>
          <span>par {carte.auteur}</span>
        </div>

        <div className="mt-4 text-[17px] leading-relaxed"
             dangerouslySetInnerHTML={{ __html: carte.rectoHtml }} />

        {revele ? (
          <>
            <hr className="my-5" />
            <div className="text-[17px] leading-relaxed"
                 dangerouslySetInnerHTML={{ __html: carte.versoHtml }} />
          </>
        ) : (
          <p className="mt-8 text-center text-[13px] text-[var(--muted-foreground)]">
            Touchez la carte ou appuyez sur <kbd className="rounded border px-1.5 py-0.5">Espace</kbd>
          </p>
        )}

        {carte.signalee && (
          <p className="mt-4 rounded-[var(--radius-sm)] bg-[var(--destructive)]/10 px-2 py-1.5
                        text-[11px] font-medium text-[var(--destructive)]">
            Cette carte a été signalée — vérifiez son contenu.
          </p>
        )}
      </button>

      {erreur && (
        <p role="alert" className="mt-2 rounded-[var(--radius-md)] bg-[var(--destructive)]/10
                                   px-3 py-2 text-[13px] font-medium text-[var(--destructive)]">
          {erreur}
        </p>
      )}

      {/* Les quatre notes, avec l'intervalle calculé par le serveur. */}
      <div className="sticky bottom-0 mt-3 pb-3">
        {revele ? (
          <div className="grid grid-cols-4 gap-1.5">
            {carte.apercu.map((a) => (
              <button
                key={a.cle}
                type="button"
                disabled={enCours}
                onClick={() => void noter(a.cle)}
                className="rounded-[var(--radius-md)] border-2 bg-[var(--card)] px-1 py-2.5
                           transition-colors disabled:opacity-40"
                style={{ borderColor: COULEURS[a.cle] }}
              >
                <span className="tabular block text-[11px] font-semibold"
                      style={{ color: COULEURS[a.cle] }}>
                  {a.intervalle}
                </span>
                <span className="mt-0.5 block text-[12px] font-medium">{a.label}</span>
                <span className="mt-0.5 block text-[10px] text-[var(--muted-foreground)]">
                  {a.touche}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevele(true)}
            className="w-full rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3.5
                       text-[15px] font-semibold text-[var(--primary-foreground)]"
          >
            Afficher la réponse
          </button>
        )}

        <div className="mt-2 flex justify-between text-[11px]">
          <Link href={`/fiches/${deckSlug}`} className="text-[var(--muted-foreground)] underline">
            Quitter la session
          </Link>
          <BoutonSignaler cardId={carte.cardId} />
        </div>
      </div>
    </div>
  );
}

function Compteur({ n, couleur, titre }: { n: number; couleur: string; titre: string }) {
  return (
    <span title={titre} className="font-semibold" style={{ color: n > 0 ? couleur : "var(--muted-foreground)" }}>
      {n} <span className="font-normal">{titre === "nouvelles" ? "nouv." : titre === "en apprentissage" ? "appr." : "rév."}</span>
    </span>
  );
}

/** Signalement d'une carte fausse, sans quitter la session. */
function BoutonSignaler({ cardId }: { cardId: number }) {
  const [envoye, setEnvoye] = useState(false);

  if (envoye) {
    return <span className="text-[var(--muted-foreground)]">Signalée, merci</span>;
  }
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
      className="text-[var(--muted-foreground)] underline"
    >
      Signaler une erreur
    </button>
  );
}
