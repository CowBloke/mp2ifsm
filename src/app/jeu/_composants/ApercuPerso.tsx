"use client";

import { useEffect, useRef } from "react";
import type { ApercuMonte } from "@jeu/client";

/*
 * Aperçu animé du personnage choisi : il enchaîne ses coups sur un
 * mannequin. Le rendu (et Pixi) est chargé après l'affichage de la page ;
 * sans WebGL, ou si l'utilisateur préfère réduire les animations, le
 * cadre reste simplement vide.
 */
export function ApercuPerso({ perso, className }: { perso: string; className?: string }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const apercu = useRef<ApercuMonte | null>(null);
  const voulu = useRef(perso);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let annule = false;
    import("@jeu/client")
      .then(({ monterApercu }) => monterApercu(conteneur.current!, voulu.current))
      .then((a) => {
        if (annule) a.detruire();
        else {
          apercu.current = a;
          a.changer(voulu.current);
        }
      })
      .catch((err) => console.warn("aperçu du jeu indisponible :", err));
    return () => {
      annule = true;
      apercu.current?.detruire();
      apercu.current = null;
    };
  }, []);

  useEffect(() => {
    voulu.current = perso;
    apercu.current?.changer(perso);
  }, [perso]);

  return <div ref={conteneur} className={className} aria-hidden="true" />;
}
