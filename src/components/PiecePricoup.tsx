"use client";

import { useEffect, useState } from "react";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "pricoup-medal": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        "auto-rotate"?: string;
        "asset-base"?: string;
        lighting?: "studio" | "warm" | "dramatic";
      };
    }
  }
}

/*
 * Grande pièce de pricoupenkoin en 3D. Three.js (~500 ko) n'est chargé
 * qu'ici, à la demande ; l'espace est réservé pour que le solde ne
 * saute pas pendant le chargement.
 */
export function PiecePricoup() {
  const [prete, setPrete] = useState(false);
  useEffect(() => {
    import("./medaille/pricoup-medal.js").then(() => setPrete(true), () => {});
  }, []);

  return (
    <div className="mx-auto aspect-square w-full max-w-[280px]">
      {prete && (
        <pricoup-medal auto-rotate="" lighting="studio" asset-base="/medaille/"
                       style={{ width: "100%", height: "100%" }} />
      )}
    </div>
  );
}
