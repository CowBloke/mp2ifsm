"use client";

import { useEffect, useRef, useState } from "react";
import {
  PREFERENCES_DEFAUT, chargerPreferences, enregistrerPreferences,
  type ConnexionJeu, type DebutPartie, type EtatConnexion, type OptionsEntrainement, type PartieMontee, type PreferencesJeu,
} from "@jeu/client";

const COMMANDES: [string, string][] = [
  ["Bouger", "ZQSD ou flèches"],
  ["Sauter", "Espace (2× en l’air)"],
  ["Dash", "Maj"],
  ["Attaque", "J ou X (+ direction)"],
  ["Spécial", "K ou C (+ direction)"],
  ["Ultime", "L ou V (jauge pleine)"],
  ["Menu", "Échap (Start)"],
  ["Hitboxes", "H"],
];

type Props =
  | { mode: "entrainement"; options: OptionsEntrainement; quitter: () => void }
  | { mode: "reseau"; connexion: ConnexionJeu; partie: DebutPartie; etat: EtatConnexion; quitter: () => void };

const BOUTON = "rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[13px] font-medium hover:bg-black/60";

/*
 * Calque plein écran qui héberge une partie (entraînement local ou en
 * réseau). React ne fait que fournir un conteneur et le libérer : il ne
 * voit jamais l'état de la partie. Le rendu (et Pixi avec lui) est
 * importé à la demande. Le menu (Échap) règle le son et les secousses ;
 * à l'entraînement, il met aussi la partie en pause.
 */
export function EcranJeu(props: Props) {
  const racine = useRef<HTMLDivElement>(null);
  const conteneur = useRef<HTMLDivElement>(null);
  const partie = useRef<PartieMontee | null>(null);
  const [etat, setEtat] = useState<"chargement" | "pret" | "erreur">("chargement");
  const [aide, setAide] = useState(props.mode === "entrainement");
  const [menu, setMenu] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const [prefs, setPrefs] = useState<PreferencesJeu>(PREFERENCES_DEFAUT);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [actif, setActif] = useState(true);
  const cle = props.mode === "reseau" ? props.partie : props.options;
  const spectateur = props.mode === "reseau" && props.partie.place < 0;

  function ouvrirMenu(ouvert: boolean) {
    setMenu(ouvert);
    setConfirmer(false);
    partie.current?.pause?.(ouvert);
    // Un bouton resté sélectionné se déclencherait à la prochaine barre d'espace (le saut).
    if (!ouvert && document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function changerPrefs(p: PreferencesJeu) {
    setPrefs(p);
    enregistrerPreferences(p);
    partie.current?.preferences(p);
  }

  // Échap (ou Start à la manette) ouvre et ferme le menu.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat) return;
      e.preventDefault();
      ouvrirMenu(!menu);
    };
    window.addEventListener("keydown", touche);
    let start = true;
    const manettes = setInterval(() => {
      const appui = [...(navigator.getGamepads?.() ?? [])].some((m) => m?.buttons[9]?.pressed === true);
      if (appui && !start) ouvrirMenu(!menu);
      start = appui;
    }, 80);
    return () => {
      window.removeEventListener("keydown", touche);
      clearInterval(manettes);
    };
    // ouvrirMenu ne lit que des références stables ; seul `menu` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu]);

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
    const preferences = chargerPreferences();
    setPrefs(preferences);
    import("@jeu/client")
      .then(({ monterJeu }) => monterJeu(conteneur.current!, props.mode === "reseau"
        ? { mode: "reseau", connexion: props.connexion, partie: props.partie }
        : { mode: "entrainement", ...props.options }, preferences))
      .then((p) => {
        if (annule) p.detruire();
        else {
          partie.current = p;
          setEtat("pret");
        }
      })
      .catch((err) => {
        console.error("jeu:", err);
        if (!annule) setEtat("erreur");
      });
    return () => {
      annule = true;
      partie.current?.detruire();
      partie.current = null;
    };
    // La partie (ou la configuration d'entraînement) identifie le montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  const reconnexion = props.mode === "reseau" && props.etat.statut === "reconnexion";
  const titreMenu = props.mode === "entrainement" ? "Pause" : spectateur ? "Menu" : "Menu · la partie continue";

  return (
    <div ref={racine} className={`fixed inset-0 z-[60] bg-[#07090f] text-white ${actif || menu ? "" : "cursor-none"}`}>
      <div ref={conteneur} className="absolute inset-0" />

      <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 transition-opacity
                       duration-500 ${spectateur && !actif && !menu ? "opacity-0" : ""}`}>
        <div className="pointer-events-auto flex gap-2">
          <button type="button" onClick={() => ouvrirMenu(!menu)} aria-expanded={menu} className={BOUTON}>
            Menu <span className="text-white/45">Échap</span>
          </button>
          {spectateur ? (
            <span className="self-center rounded-full bg-black/40 px-3 py-1 text-[12px] font-semibold text-white/75">
              Spectateur · salon <span className="font-black tracking-[0.15em] text-white">{props.partie.code}</span>
            </span>
          ) : null}
          {props.mode === "reseau" && props.etat.rtt !== null ? (
            <span className="self-center rounded-full bg-black/40 px-2.5 py-1 text-[11px] text-white/60">
              {props.etat.rtt} ms
            </span>
          ) : null}
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div className="flex gap-2">
            <button type="button" onClick={basculerPleinEcran} className={BOUTON}>
              {pleinEcran ? "Quitter le plein écran" : "Plein écran"}
            </button>
            {spectateur ? null : (
              <button type="button" onClick={() => setAide(!aide)} aria-expanded={aide} className={BOUTON}>
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

      {menu ? (
        <div className="absolute inset-0 grid place-items-center bg-black/45 px-4 backdrop-blur-[2px]"
             onClick={(e) => { if (e.target === e.currentTarget) ouvrirMenu(false); }}>
          <div role="dialog" aria-modal="true" aria-label={titreMenu}
               className="w-full max-w-[360px] rounded-2xl border border-white/15 bg-[#0d111c]/95 p-5 shadow-2xl">
            <p className="text-[22px] font-black">{titreMenu}</p>

            <label className="mt-4 block text-[13px] font-semibold text-white/70">
              Volume · {Math.round(prefs.volume * 100)} %
              <input type="range" min={0} max={100} step={5} value={Math.round(prefs.volume * 100)}
                     onChange={(e) => changerPrefs({ ...prefs, volume: Number(e.target.value) / 100 })}
                     className="mt-1.5 block w-full accent-[#4f8cff]" />
            </label>
            <label className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-white/70">
              <input type="checkbox" checked={prefs.secousses}
                     onChange={(e) => changerPrefs({ ...prefs, secousses: e.target.checked })}
                     className="size-4 accent-[#4f8cff]" />
              Secousses d’écran aux impacts
            </label>

            <div className="mt-5 grid gap-2">
              <button type="button" onClick={() => ouvrirMenu(false)} autoFocus
                      className="rounded-xl bg-white/90 px-4 py-2.5 text-[14px] font-bold text-[#0b0e17] hover:bg-white">
                Reprendre
              </button>
              {props.mode === "entrainement" ? (
                <button type="button" onClick={() => { partie.current?.recommencer?.(); ouvrirMenu(false); }}
                        className="rounded-xl border border-white/15 px-4 py-2.5 text-[14px] font-semibold hover:bg-white/10">
                  Recommencer
                </button>
              ) : null}
              <button type="button"
                      onClick={() => (confirmer || spectateur || props.mode === "entrainement" ? props.quitter() : setConfirmer(true))}
                      className={`rounded-xl border px-4 py-2.5 text-[14px] font-semibold ${confirmer
                        ? "border-[#ff5a5f] bg-[#ff5a5f]/25" : "border-white/15 hover:bg-white/10"}`}>
                {props.mode === "entrainement" || spectateur ? "Quitter"
                  : confirmer ? "Confirmer : abandonner la partie" : "Abandonner la partie"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
