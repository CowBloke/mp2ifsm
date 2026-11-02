"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentProps, DetailedHTMLProps, HTMLAttributes } from "react";
import Link from "next/link";
import { AFFICHE_PIECE } from "@/lib/constantes";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "pricoup-medal": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        "auto-rotate"?: string;
        lighting?: "studio" | "warm" | "dramatic";
      };
    }
  }
}

/* Image de la pièce telle que WebGL la dessine au départ (même angle). */
function AffichePiece() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={AFFICHE_PIECE} alt="" width={560} height={560} fetchPriority="high"
         className="absolute inset-0 h-full w-full" />
  );
}

/* Emplacement de la pièce pendant que le solde se charge. */
export function PieceAttente() {
  return <div className="relative mx-auto aspect-square w-full max-w-[280px]"><AffichePiece /></div>;
}

/*
 * Grande pièce de pricoupenkoin en 3D. L'affiche s'affiche immédiatement
 * et reste en place si WebGL échoue ; Three.js (~500 ko) n'est chargé qu'à
 * la demande et remplace l'affiche dès le premier rendu.
 */
export function PiecePricoup() {
  const [module3d, setModule3d] = useState(false);
  const [dessinee, setDessinee] = useState(false);
  const zone = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Sur le conteneur, en place avant la pièce : si le modèle est déjà
    // préchargé, medal-ready part dès le montage de l'élément.
    const el = zone.current;
    const pret = () => setDessinee(true);
    el?.addEventListener("medal-ready", pret);
    import("./medaille/pricoup-medal.js").then(() => setModule3d(true), () => {});
    return () => el?.removeEventListener("medal-ready", pret);
  }, []);

  return (
    <div ref={zone} className="relative mx-auto aspect-square w-full max-w-[280px]">
      {!dessinee && <AffichePiece />}
      {module3d && (
        <pricoup-medal auto-rotate="" lighting="studio"
                       style={{ position: "absolute", inset: 0 }} />
      )}
    </div>
  );
}

let prechargement = false;
function prechargerPiece() {
  if (prechargement) return;
  prechargement = true;
  new Image().src = AFFICHE_PIECE;
  import("./medaille/pricoup-medal.js").then(m => m.preloadMedal()).catch(() => { prechargement = false; });
}

/*
 * Préchargement discret sur l'accueil, une fois la page au repos : le profil
 * affiche alors la pièce sans attente. Rien sur une connexion lente ou économe.
 */
export function PrechargePiece() {
  useEffect(() => {
    const reseau = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (reseau?.saveData || /(^|-)2g$/.test(reseau?.effectiveType ?? "")) return;

    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(prechargerPiece, { timeout: 4000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(prechargerPiece, 1500);
    return () => clearTimeout(id);
  }, []);
  return null;
}

/* Lien vers le profil : le survol, le toucher ou le focus lancent le préchargement. */
export function LienProfil(props: Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link {...props} href="/profil" onMouseEnter={prechargerPiece}
          onTouchStart={prechargerPiece} onFocus={prechargerPiece} />
  );
}
