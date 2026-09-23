"use client";

import { useEffect, useRef, useState } from "react";
import type { ConnexionJeu, DebutPartie, EtatConnexion, OptionsEntrainement } from "@jeu/client";

const COMMANDES: [string, string][] = [
  ["Bouger", "ZQSD ou flèches"],
  ["Sauter", "Espace (2× en l’air)"],
  ["Dash", "Maj"],
  ["Attaque", "J ou X (+ direction)"],
  ["Spécial", "K ou C (+ direction)"],
  ["Ultime", "L ou V (jauge pleine)"],
  ["Hitboxes", "H"],
];

type Props =
  | { mode: "entrainement"; options: OptionsEntrainement; quitter: () => void }
  | { mode: "reseau"; connexion: ConnexionJeu; partie: DebutPartie; etat: EtatConnexion; quitter: () => void };

/*
 * Calque plein écran qui héberge une partie (entraînement local ou en
 * réseau). React ne fait que fournir un conteneur et le libérer : il ne
 * voit jamais l'état de la partie. Le rendu (et Pixi avec lui) est
 * importé à la demande.
 */
export function EcranJeu(props: Props) {
  const racine = useRef<HTMLDivElement>(null);
  const conteneur = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<"chargement" | "pret" | "erreur">("chargement");
  const [aide, setAide] = useState(props.mode === "entrainement");
  const [confirmer, setConfirmer] = useState(false);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [actif, setActif] = useState(true);
  const cle = props.mode === "reseau" ? props.partie : props.options;
  const spectateur = props.mode === "reseau" && props.partie.place < 0;

  // Souris immobile : le curseur disparaît (et, pour un spectateur, les boutons aussi).
  useEffect(() => {
    let minuteur = setTimeout(() => setActif(false), 2500);
    const bouger = () => {
      setActif(true);
      clearTimeout(minuteur);
      minuteur = setTimeout(() => setActif(false), 2500);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerdown", bouger);
    const suivrePleinEcran = () => setPleinEcran(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", suivrePleinEcran);
    return () => {
      clearTimeout(minuteur);
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerdown", bouger);
      document.removeEventListener("fullscreenchange", suivrePleinEcran);
    };
  }, []);

  function basculerPleinEcran() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else racine.current?.requestFullscreen().catch(() => {});
  }

  useEffect(() => {
    // En développement, React monte l'effet deux fois : une partie dont
    // l'initialisation se termine après le démontage est aussitôt détruite.
    let annule = false;
    let partie: { detruire(): void } | null = null;
    import("@jeu/client")
      .then(({ monterJeu }) => monterJeu(conteneur.current!, props.mode === "reseau"
        ? { mode: "reseau", connexion: props.connexion, partie: props.partie }
        : { mode: "entrainement", ...props.options }))
      .then((p) => {
        if (annule) p.detruire();
        else {
          partie = p;
          setEtat("pret");
        }
      })
      .catch((err) => {
        console.error("jeu:", err);
        if (!annule) setEtat("erreur");
      });
    return () => {
      annule = true;
      partie?.detruire();
    };
    // La partie (ou la configuration d'entraînement) identifie le montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  const reconnexion = props.mode === "reseau" && props.etat.statut === "reconnexion";

  return (
    <div ref={racine} className={`fixed inset-0 z-[60] bg-[#07090f] text-white ${actif ? "" : "cursor-none"}`}>
      <div ref={conteneur} className="absolute inset-0" />

      <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 transition-opacity
                       duration-500 ${spectateur && !actif ? "opacity-0" : ""}`}>
        {props.mode === "entrainement" ? (
          <button type="button" onClick={props.quitter}
                  className="pointer-events-auto rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[13px]
                             font-medium hover:bg-black/60">
            ← Quitter
          </button>
        ) : (
          <div className="pointer-events-auto flex gap-2">
            <button type="button" onClick={() => (confirmer || spectateur ? props.quitter() : setConfirmer(true))}
                    onBlur={() => setConfirmer(false)}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${confirmer
                      ? "border-[#ff5a5f] bg-[#ff5a5f]/25" : "border-white/20 bg-black/40 hover:bg-black/60"}`}>
              {confirmer ? "Abandonner la partie ?" : "← Quitter"}
            </button>
            {spectateur ? (
              <span className="self-center rounded-full bg-black/40 px-3 py-1 text-[12px] font-semibold text-white/75">
                Spectateur · salon <span className="font-black tracking-[0.15em] text-white">{props.partie.code}</span>
              </span>
            ) : null}
            {props.etat.rtt !== null ? (
              <span className="self-center rounded-full bg-black/40 px-2.5 py-1 text-[11px] text-white/60">
                {props.etat.rtt} ms
              </span>
            ) : null}
          </div>
        )}
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex gap-2">
            <button type="button" onClick={basculerPleinEcran}
                    className="rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[13px] font-medium hover:bg-black/60">
              {pleinEcran ? "Quitter le plein écran" : "Plein écran"}
            </button>
            {spectateur ? null : (
              <button type="button" onClick={() => setAide(!aide)} aria-expanded={aide}
                      className="rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[13px] font-medium hover:bg-black/60">
                {aide ? "Masquer l’aide" : "Commandes"}
              </button>
            )}
          </div>
          {aide && !spectateur ? (
            <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-[var(--radius-md)] bg-black/55 px-3 py-2
                           text-[12px] leading-snug">
              {COMMANDES.map(([action, touches]) => (
                <div key={action} className="contents">
                  <dt className="text-white/55">{action}</dt>
                  <dd className="text-right font-medium text-white/90">{touches}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>

      {reconnexion ? (
        <p className="absolute inset-x-0 top-16 mx-auto w-fit rounded-full bg-[#ff5a5f]/90 px-4 py-1.5 text-[13px] font-semibold">
          Connexion perdue, reconnexion…
        </p>
      ) : null}
      {etat === "chargement" ? (
        <p className="absolute inset-0 grid place-items-center text-[13px] text-white/60">Chargement…</p>
      ) : null}
      {etat === "erreur" ? (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-white/80">
          Le jeu n’a pas pu démarrer : ce navigateur ne semble pas prendre en charge WebGL.
        </p>
      ) : null}
    </div>
  );
}
