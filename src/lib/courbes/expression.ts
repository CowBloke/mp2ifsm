/*
 * Curve Fight : lecture, vérification et évaluation des expressions.
 *
 * Module pur, partagé par le serveur (qui fait foi) et le navigateur
 * (retour immédiat pendant la saisie). Aucune évaluation de code : le
 * texte devient un arbre, l'arbre une fermeture. Tout ce qui n'est pas
 * dans la grammaire est refusé avec un message en français.
 */

export type Noeud =
  | { t: "n"; v: number }
  | { t: "x" }
  | { t: "y" }
  | { t: "c"; nom: "pi" | "e" }
  | { t: "neg"; a: Noeud }
  | { t: "op"; op: "+" | "-" | "*" | "/" | "^"; a: Noeud; b: Noeud; implicite?: boolean }
  | { t: "f"; nom: NomFonction; args: Noeud[] };

/** Familles de fonctions qu'un salon autorise ou non. */
export type Famille = "trigo" | "reciproques" | "explog" | "racines" | "hyperboliques" | "paliers";

type Definition = { famille: Famille; arite: number; calcul: (...a: number[]) => number; latex?: string };

const FONCTIONS = {
  sin: { famille: "trigo", arite: 1, calcul: Math.sin },
  cos: { famille: "trigo", arite: 1, calcul: Math.cos },
  tan: { famille: "trigo", arite: 1, calcul: Math.tan },
  arcsin: { famille: "reciproques", arite: 1, calcul: Math.asin },
  arccos: { famille: "reciproques", arite: 1, calcul: Math.acos },
  arctan: { famille: "reciproques", arite: 1, calcul: Math.atan },
  exp: { famille: "explog", arite: 1, calcul: Math.exp },
  ln: { famille: "explog", arite: 1, calcul: (v: number) => (v > 0 ? Math.log(v) : NaN) },
  sqrt: { famille: "racines", arite: 1, calcul: (v: number) => (v >= 0 ? Math.sqrt(v) : NaN) },
  abs: { famille: "racines", arite: 1, calcul: Math.abs },
  sh: { famille: "hyperboliques", arite: 1, calcul: Math.sinh, latex: "\\operatorname{sh}" },
  ch: { famille: "hyperboliques", arite: 1, calcul: Math.cosh, latex: "\\operatorname{ch}" },
  th: { famille: "hyperboliques", arite: 1, calcul: Math.tanh, latex: "\\operatorname{th}" },
  floor: { famille: "paliers", arite: 1, calcul: Math.floor },
  ceil: { famille: "paliers", arite: 1, calcul: Math.ceil },
  sgn: { famille: "paliers", arite: 1, calcul: Math.sign, latex: "\\operatorname{sgn}" },
  min: { famille: "paliers", arite: 2, calcul: Math.min },
  max: { famille: "paliers", arite: 2, calcul: Math.max },
} satisfies Record<string, Definition>;

export type NomFonction = keyof typeof FONCTIONS;

/** Autres écritures acceptées à la saisie. */
const ALIAS: Record<string, NomFonction> = {
  asin: "arcsin", acos: "arccos", atan: "arctan", log: "ln", racine: "sqrt",
  sinh: "sh", cosh: "ch", tanh: "th", ent: "floor", signe: "sgn",
};

export const FAMILLES: { cle: Famille; nom: string; fonctions: NomFonction[] }[] = [
  { cle: "trigo", nom: "Trigonométrie", fonctions: ["sin", "cos", "tan"] },
  { cle: "reciproques", nom: "Trigo réciproque", fonctions: ["arcsin", "arccos", "arctan"] },
  { cle: "explog", nom: "Exponentielle et logarithme", fonctions: ["exp", "ln"] },
  { cle: "racines", nom: "Racine et valeur absolue", fonctions: ["sqrt", "abs"] },
  { cle: "hyperboliques", nom: "Hyperboliques", fonctions: ["sh", "ch", "th"] },
  { cle: "paliers", nom: "Paliers et extrema", fonctions: ["floor", "ceil", "sgn", "min", "max"] },
];
export const TOUTES_FAMILLES: Famille[] = FAMILLES.map((f) => f.cle);

export const LONGUEUR_ABSOLUE = 120;
const NOEUDS_MAX = 160;
const PROFONDEUR_MAX = 40;

export class ErreurExpression extends Error {}

// Du plus long au plus court : « exp » avant « e », « arcsin » avant « a… ».
const MOTS = [...Object.keys(FONCTIONS), ...Object.keys(ALIAS), "pi", "e", "x", "y"]
  .sort((a, b) => b.length - a.length);

type Jeton =
  | { t: "nb"; v: number }
  | { t: "mot"; nom: string }
  | { t: "sym"; s: string };

function normaliser(source: string): string {
  return source
    .replace(/[×·∙⋅]/g, "*").replace(/[−–—]/g, "-").replace(/[÷:]/g, "/")
    .replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/²/g, "^2").replace(/³/g, "^3")
    .replace(/\*\*/g, "^").toLowerCase();
}

function decouper(source: string): Jeton[] {
  const s = normaliser(source);
  const jetons: Jeton[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const nb = /^(\d+(\.\d*)?|\.\d+)/.exec(s.slice(i));
    if (nb) { jetons.push({ t: "nb", v: Number(nb[0]) }); i += nb[0].length; continue; }
    if ("+-*/^(),".includes(c)) { jetons.push({ t: "sym", s: c }); i++; continue; }
    if (/[a-z]/.test(c)) {
      const mot = MOTS.find((m) => s.startsWith(m, i));
      if (!mot) {
        const inconnu = /^[a-z]+/.exec(s.slice(i))![0];
        throw new ErreurExpression(`« ${inconnu} » n’est pas reconnu`);
      }
      jetons.push({ t: "mot", nom: mot });
      i += mot.length;
      continue;
    }
    throw new ErreurExpression(`Caractère « ${c} » inattendu`);
  }
  return jetons;
}

/** Descente récursive : somme > produit (explicite ou implicite) > signe > puissance. */
function analyser(jetons: Jeton[]): Noeud {
  let p = 0;
  let noeuds = 0;

  const sym = (s: string) => { const j = jetons[p]; return !!j && j.t === "sym" && j.s === s; };
  const compter = <T extends Noeud>(n: T): T => {
    if (++noeuds > NOEUDS_MAX) throw new ErreurExpression("Expression trop compliquée");
    return n;
  };
  const debutPrimaire = () => {
    const j = jetons[p];
    return !!j && (j.t === "nb" || j.t === "mot" || (j.t === "sym" && j.s === "("));
  };

  function somme(prof: number): Noeud {
    if (prof > PROFONDEUR_MAX) throw new ErreurExpression("Trop de parenthèses imbriquées");
    let a = produit(prof);
    while (sym("+") || sym("-")) {
      const op = (jetons[p++] as { s: "+" | "-" }).s;
      a = compter({ t: "op", op, a, b: produit(prof) });
    }
    return a;
  }

  function produit(prof: number): Noeud {
    let a = signe(prof);
    for (;;) {
      if (sym("*") || sym("/")) {
        const op = (jetons[p++] as { s: "*" | "/" }).s;
        a = compter({ t: "op", op, a, b: signe(prof) });
      } else if (debutPrimaire()) {
        // 2x, x(x+1), 2sin(x) : produit implicite.
        a = compter({ t: "op", op: "*", a, b: puissance(prof), implicite: true });
      } else return a;
    }
  }

  function signe(prof: number): Noeud {
    if (sym("-")) { p++; return compter({ t: "neg", a: signe(prof + 1) }); }
    if (sym("+")) { p++; return signe(prof + 1); }
    return puissance(prof);
  }

  function puissance(prof: number): Noeud {
    const base = primaire(prof);
    if (!sym("^")) return base;
    p++;
    // Associative à droite, exposant signé : 2^-x, x^2^3 = x^(2^3).
    return compter({ t: "op", op: "^", a: base, b: signe(prof + 1) });
  }

  function primaire(prof: number): Noeud {
    const j = jetons[p];
    if (!j) throw new ErreurExpression("Il manque la fin de l’expression");
    if (j.t === "nb") { p++; return compter({ t: "n", v: j.v }); }
    if (j.t === "sym") {
      if (j.s !== "(") throw new ErreurExpression(`« ${j.s} » mal placé`);
      p++;
      const dedans = somme(prof + 1);
      if (!sym(")")) throw new ErreurExpression("Il manque une parenthèse fermante");
      p++;
      return dedans;
    }
    p++;
    if (j.nom === "x") return compter({ t: "x" });
    if (j.nom === "y") return compter({ t: "y" });
    if (j.nom === "pi" || j.nom === "e") return compter({ t: "c", nom: j.nom });
    const nom = (ALIAS[j.nom] ?? j.nom) as NomFonction;
    if (!sym("(")) throw new ErreurExpression(`Mets des parenthèses après ${j.nom}`);
    p++;
    const args = [somme(prof + 1)];
    while (sym(",")) { p++; args.push(somme(prof + 1)); }
    if (!sym(")")) throw new ErreurExpression("Il manque une parenthèse fermante");
    p++;
    const arite = FONCTIONS[nom].arite;
    if (args.length !== arite) {
      throw new ErreurExpression(`${nom} attend ${arite} argument${arite > 1 ? "s" : ""}`);
    }
    return compter({ t: "f", nom, args });
  }

  if (jetons.length === 0) throw new ErreurExpression("Expression vide");
  const racine = somme(0);
  if (p < jetons.length) {
    const j = jetons[p];
    if (j.t === "sym" && j.s === ",") throw new ErreurExpression("Écris les décimales avec un point : 0.5");
    throw new ErreurExpression(j.t === "sym" && j.s === ")" ? "Parenthèse fermante en trop" : "Expression mal formée");
  }
  return racine;
}

export type Expression = {
  source: string;
  arbre: Noeud;
  fonctions: NomFonction[];
  utiliseY: boolean;
  utiliseX: boolean;
};

export function lire(source: string): Expression {
  const texte = source.trim();
  if (texte.length > LONGUEUR_ABSOLUE) throw new ErreurExpression(`${LONGUEUR_ABSOLUE} caractères au plus`);
  const arbre = analyser(decouper(texte));
  const fonctions = new Set<NomFonction>();
  let utiliseY = false, utiliseX = false;
  (function visiter(n: Noeud) {
    if (n.t === "x") utiliseX = true;
    else if (n.t === "y") utiliseY = true;
    else if (n.t === "neg") visiter(n.a);
    else if (n.t === "op") { visiter(n.a); visiter(n.b); }
    else if (n.t === "f") { fonctions.add(n.nom); n.args.forEach(visiter); }
  })(arbre);
  return { source: texte, arbre, fonctions: [...fonctions], utiliseY, utiliseX };
}

export type Contraintes = { familles: Famille[]; longueurMax: number; equadiff: boolean };

/** Lit une expression et applique les règles du salon. Lève ErreurExpression. */
export function verifier(source: string, regles: Contraintes): Expression {
  const e = lire(source);
  const longueur = e.source.replace(/\s+/g, "").length;
  if (regles.longueurMax > 0 && longueur > regles.longueurMax) {
    throw new ErreurExpression(`${regles.longueurMax} caractères au plus dans ce salon (${longueur} ici)`);
  }
  if (e.utiliseY && !regles.equadiff) throw new ErreurExpression("y n’existe qu’en mode équation différentielle");
  for (const f of e.fonctions) {
    if (!regles.familles.includes(FONCTIONS[f].famille)) {
      throw new ErreurExpression(`${f} n’est pas autorisée dans ce salon`);
    }
  }
  return e;
}

/** Fermeture (x, y) → valeur. NaN ou infini : la courbe n'existe pas là. */
export function compiler(n: Noeud): (x: number, y: number) => number {
  switch (n.t) {
    case "n": { const v = n.v; return () => v; }
    case "x": return (x) => x;
    case "y": return (_x, y) => y;
    case "c": { const v = n.nom === "pi" ? Math.PI : Math.E; return () => v; }
    case "neg": { const a = compiler(n.a); return (x, y) => -a(x, y); }
    case "op": {
      const a = compiler(n.a), b = compiler(n.b);
      switch (n.op) {
        case "+": return (x, y) => a(x, y) + b(x, y);
        case "-": return (x, y) => a(x, y) - b(x, y);
        case "*": return (x, y) => a(x, y) * b(x, y);
        case "/": return (x, y) => { const d = b(x, y); return d === 0 ? NaN : a(x, y) / d; };
        default: return (x, y) => Math.pow(a(x, y), b(x, y));
      }
    }
    case "f": {
      const calcul = FONCTIONS[n.nom].calcul as (...a: number[]) => number;
      const args = n.args.map(compiler);
      if (args.length === 1) { const a = args[0]; return (x, y) => calcul(a(x, y)); }
      const [a, b] = args;
      return (x, y) => calcul(a(x, y), b(x, y));
    }
  }
}

/* --- Écriture mathématique (KaTeX) ------------------------------------ */

const PRIORITE = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 } as const;
function priorite(n: Noeud): number {
  if (n.t === "op") return n.op === "/" ? 5 : PRIORITE[n.op];   // une fraction se suffit
  if (n.t === "neg") return 1;
  return 5;
}
const entre = (s: string) => `\\left(${s}\\right)`;

/** Point décimal, comme à la saisie : la formule affichée se relit caractère par caractère. */
function nombre(v: number): string {
  return String(Number(v.toPrecision(10)));
}

/** Premier symbole à gauche : un chiffre impose un point de multiplication. */
function commenceParChiffre(n: Noeud): boolean {
  if (n.t === "n") return true;
  if (n.t === "op" && n.op !== "/") return commenceParChiffre(n.a);
  return false;
}

export function versLatex(n: Noeud): string {
  switch (n.t) {
    case "n": return nombre(n.v);
    case "x": return "x";
    case "y": return "y";
    case "c": return n.nom === "pi" ? "\\pi" : "\\mathrm{e}";
    case "neg": {
      const a = versLatex(n.a);
      return `-${priorite(n.a) < 2 ? entre(a) : a}`;
    }
    case "f": {
      const args = n.args.map(versLatex);
      if (n.nom === "sqrt") return `\\sqrt{${args[0]}}`;
      if (n.nom === "abs") return `\\left|${args[0]}\\right|`;
      if (n.nom === "floor") return `\\left\\lfloor ${args[0]}\\right\\rfloor`;
      if (n.nom === "ceil") return `\\left\\lceil ${args[0]}\\right\\rceil`;
      if (n.nom === "exp") return `\\mathrm{e}^{${args[0]}}`;
      const def = FONCTIONS[n.nom] as Definition;
      return `${def.latex ?? `\\${n.nom}`}${entre(args.join(",\\,"))}`;
    }
    case "op": {
      const a = versLatex(n.a), b = versLatex(n.b);
      if (n.op === "/") return `\\frac{${a}}{${b}}`;
      if (n.op === "^") {
        const base = priorite(n.a) < 5 || (n.a.t === "f" && n.a.nom === "exp") ? entre(a) : a;
        return `${base}^{${b}}`;
      }
      const pr = PRIORITE[n.op];
      // −0.3(x−2)² : un signe en tête de produit se lit sans parenthèses.
      const g = priorite(n.a) < pr && !(n.op === "*" && n.a.t === "neg") ? entre(a) : a;
      const d = priorite(n.b) < pr || (n.op === "-" && priorite(n.b) === pr) || n.b.t === "neg" ? entre(b) : b;
      if (n.op === "*") return commenceParChiffre(n.b) ? `${g}\\times ${d}` : `${g}\\,${d}`;
      return `${g}${n.op}${d}`;
    }
  }
}

/** Forme de comparaison pour les classements : sans espaces, alias résolus. */
export function formeCanonique(source: string): string {
  return normaliser(source).replace(/\s+/g, "");
}
