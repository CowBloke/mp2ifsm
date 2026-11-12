/*
 * Identité des rubriques du Divertissement : une couleur et une icône
 * illustrée par jeu, à la manière d'une salle de jeux. Ces couleurs
 * restent les mêmes en mode sombre ; le texte posé dessus est toujours
 * l'encre foncée (--jeu-encre), lisible sur chacune d'elles.
 */

export type CleJeu = "marche" | "reels" | "videos" | "courbes" | "toile" | "toilet";

export type Jeu = {
  cle: CleJeu;
  nom: string;
  href: string;
  /** Couleur du cube, plutôt claire : l'encre est foncée. */
  couleur: string;
  Icone: () => React.JSX.Element;
};

const ENCRE = "#121212";
const BLANC = "#ffffff";

/* Tracé commun : encre épaisse, coins ronds, comme une gravure simple. */
const svg = {
  viewBox: "0 0 48 48", fill: "none", stroke: ENCRE, strokeWidth: 2.4,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true, className: "jeu-icone",
};

/* Marché : trois barres qui montent et une pièce. */
function IconeMarche() {
  return (
    <svg {...svg}>
      <path d="M6 42h36" />
      <rect x="9" y="29" width="8" height="13" rx="1.5" fill={BLANC} />
      <rect x="20" y="21" width="8" height="21" rx="1.5" fill={BLANC} />
      <rect x="31" y="13" width="8" height="29" rx="1.5" fill={ENCRE} />
      <circle cx="13" cy="14" r="7" fill="#ffd84d" />
      <circle cx="13" cy="14" r="3.2" strokeWidth="1.8" />
    </svg>
  );
}

/* Réels : un téléphone à la verticale, un ℝ à l'écran. */
function IconeReels() {
  return (
    <svg {...svg}>
      <rect x="12" y="4" width="24" height="40" rx="5" fill={BLANC} />
      <path d="M21 8h6" />
      <path d="M19.5 34V16h5.5a4.5 4.5 0 0 1 0 9h-5.5M23 16v18M24.5 25l4.5 9" strokeWidth="2.2" />
      <circle cx="40" cy="14" r="3.2" fill="#ff5a5f" />
      <circle cx="40" cy="24" r="3.2" fill={BLANC} />
    </svg>
  );
}

/* Vidéos : une caméra, objectif bleu et voyant d'enregistrement. */
function IconeVideos() {
  return (
    <svg {...svg}>
      <rect x="4" y="14" width="28" height="22" rx="4" fill={BLANC} />
      <path d="m32 21 11-6v18l-11-6z" fill={ENCRE} />
      <circle cx="18" cy="25" r="6.5" fill="#2f6fde" />
      <circle cx="18" cy="25" r="2.2" fill={BLANC} stroke="none" />
      <circle cx="9.5" cy="9" r="3" fill="#ff5a5f" />
      <path d="M15 9h8" />
    </svg>
  );
}

/* Curve Fight : un repère, une courbe qui part d'un joueur vers l'autre. */
function IconeCourbes() {
  return (
    <svg {...svg}>
      <path d="M6 6v36h36" />
      <path d="M11 33c5-17 9-17 13-8s8 6 13-13" strokeWidth="3" />
      <circle cx="11" cy="33" r="4.2" fill="#ff5a5f" />
      <circle cx="37" cy="12" r="4.2" fill={BLANC} />
    </svg>
  );
}

/* La Toile : une grille de pixels, quelques cases déjà posées. */
function IconeToile() {
  const cases: [number, number, string][] = [
    [0, 0, "#ff5a5f"], [1, 0, BLANC], [2, 0, BLANC],
    [0, 1, BLANC], [1, 1, "#2f6fde"], [2, 1, ENCRE],
    [0, 2, "#3aa865"], [1, 2, BLANC], [2, 2, "#ff5a5f"],
  ];
  return (
    <svg {...svg}>
      {cases.map(([c, l, f]) => (
        <rect key={`${c}${l}`} x={6 + c * 12.3} y={6 + l * 12.3} width="11.4" height="11.4" rx="2" fill={f} />
      ))}
    </svg>
  );
}

/* Toilet! : une cuvette de profil, réservoir et chasse. */
function IconeToilet() {
  return (
    <svg {...svg}>
      <rect x="9" y="5" width="15" height="17" rx="2.5" fill={BLANC} />
      <path d="M13 9.5h5" />
      <path d="M6 22h36c0 7.5-6 13-14 13.5L30 43H15l2-8C10.5 33 6 28.5 6 22z" fill={BLANC} />
      <path d="M24 26.5h12" strokeWidth="2" />
    </svg>
  );
}

export const JEUX: Record<CleJeu, Jeu> = {
  marche: { cle: "marche", nom: "Marché", href: "/marche", couleur: "#6fcf97", Icone: IconeMarche },
  reels: { cle: "reels", nom: "Réels", href: "/divertissement/reels", couleur: "#ff9e7a", Icone: IconeReels },
  videos: { cle: "videos", nom: "Vidéos", href: "/divertissement/videos", couleur: "#9cc3ff", Icone: IconeVideos },
  courbes: { cle: "courbes", nom: "Curve Fight", href: "/divertissement/curve-fight", couleur: "#c3a8f5", Icone: IconeCourbes },
  toile: { cle: "toile", nom: "La Toile", href: "/divertissement/toile", couleur: "#ffd84d", Icone: IconeToile },
  toilet: { cle: "toilet", nom: "Toilet!", href: "/toilet", couleur: "#7ad9d3", Icone: IconeToilet },
};

/** Variables CSS d'un jeu : à poser sur l'élément qui l'entoure (classe « jeu »). */
export function styleJeu(cle: CleJeu) {
  return { "--jeu": JEUX[cle].couleur } as React.CSSProperties;
}
