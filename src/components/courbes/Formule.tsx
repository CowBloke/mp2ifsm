"use client";

import { useEffect, useState } from "react";
import { lire, versLatex } from "@/lib/courbes/expression";

type Katex = typeof import("katex").default;
let chargement: Promise<Katex> | null = null;
/** KaTeX n'est chargé que sur les pages du jeu, au premier besoin. */
const katex = () => (chargement ??= import("katex").then((m) => m.default));

/*
 * Écriture mathématique d'une expression saisie : « f(x) = … » ou
 * « y′ = … ». Le texte passe par notre analyseur puis par KaTeX ; ce
 * qui n'est pas analysable est affiché tel quel, en texte.
 */
export function Formule({ source, equadiff, nu, className }: {
  source: string; equadiff?: boolean; nu?: boolean; className?: string;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    let latex: string;
    try {
      latex = versLatex(lire(source).arbre);
    } catch {
      setHtml(null);
      return;
    }
    const prefixe = nu ? "" : equadiff ? "y'=" : "f(x)=";
    katex().then((k) => {
      if (actif) setHtml(k.renderToString(prefixe + latex, { throwOnError: false, output: "html" }));
    }).catch(() => undefined);
    return () => { actif = false; };
  }, [source, equadiff, nu]);

  if (html === null) {
    return <span className={`font-mono ${className ?? ""}`}>{nu ? "" : equadiff ? "y′ = " : "f(x) = "}{source}</span>;
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
