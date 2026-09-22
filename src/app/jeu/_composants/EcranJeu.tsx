"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const COMMANDES: [string, string][] = [
  ["Bouger", "ZQSD ou flèches"],
  ["Sauter", "Espace (2× en l’air)"],
  ["Dash", "Maj"],
  ["Attaque", "J ou X (+ direction)"],
  ["Spécial", "K ou C (+ direction)"],
  ["Ultime", "L ou V (jauge pleine)"],
  ["Hitboxes", "H"],
];

/*
 * Calque plein écran qui héberge le client de jeu.
 *
 * React ne fait que fournir un conteneur et le libérer : il ne voit
 * jamais l'état de la partie. Le client (et Pixi avec lui) est importé à
 * la demande, donc les autres pages du site n'en chargent pas un octet.
 */
export function EcranJeu() {
  const conteneur = useRef<HTMLDivElement>(null);
  const [etat, setEtat] = useState<"chargement" | "pret" | "erreur">("chargement");
  const [aide, setAide] = useState(true);

  useEffect(() => {
    // En développement, React monte l'effet deux fois : une partie dont
    // l'initialisation se termine après le démontage est aussitôt détruite.
    let annule = false;
    let partie: { detruire(): void } | null = null;

    import("@jeu/client")
      .then(({ monterJeu }) => monterJeu(conteneur.current!))
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
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-[#0f1218] text-white">
      <div ref={conteneur} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
        <Link href="/"
              className="pointer-events-auto rounded-full border border-white/20 bg-black/40 px-3 py-1.5
                         text-[13px] font-medium hover:bg-black/60">
          ← Quitter
        </Link>
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <button type="button" onClick={() => setAide(!aide)} aria-expanded={aide}
                  className="rounded-full border border-white/20 bg-black/40 px-3 py-1.5 text-[13px]
                             font-medium hover:bg-black/60">
            {aide ? "Masquer l’aide" : "Commandes"}
          </button>
          {aide ? (
            <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-[var(--radius-md)] bg-black/55
                           px-3 py-2 text-[12px] leading-snug">
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
