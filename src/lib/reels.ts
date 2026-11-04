/*
 * Réels : blague façon « reels » d'Instagram, mais chaque vidéo est un
 * nombre réel tiré au hasard. Tout est généré côté navigateur ; rien n'est
 * enregistré (likes, abonnements et commentaires restent locaux à la page).
 * Fonctions pures : le générateur aléatoire est injectable pour les tests.
 */

export type Aleatoire = () => number;

export type CommentaireReel = {
  id: string;
  auteur: string;
  texte: string;
  likes: number;
  ilYa: string;
};

export type Reel = {
  id: string;
  valeur: string;          // nombre affiché en grand
  sous?: string;           // valeur approchée sous une forme exacte (√37…)
  legende: string;
  auteur: string;
  son: string;
  likes: number;
  partages: number;
  nbCommentaires: number;
  commentaires: CommentaireReel[];
  teinte: number;          // 0–360, fond du réel
};

const AUTEURS = [
  "cauchy_schwarz", "epsilon.delta", "le_vrai_bolzano", "dedekind.coupes", "sup_et_inf",
  "weierstrass_fan", "topologue_en_sueur", "suite_de_cauchy", "borne.sup", "archimede_off",
  "densite_de_Q", "theoreme_des_gendarmes", "TVI_officiel", "ln_de_ma_vie", "racine_de_deux",
  "lhopital_interdit", "dl_a_lordre_5", "rolle_model", "riemann_mais_sympa", "un_reel_par_jour",
  "integrale_impropre", "zeta_de_3", "euler.gamma", "nombre_premier_jsp", "khôlleur_anonyme",
  "corps_ordonne", "partie_entiere", "valeur_absolue", "le_compactifie", "ensemble_vide",
];


const CONSTANTES: { valeur: string; nom: string; legendes: string[] }[] = [
  { valeur: "3,14159265358979…", nom: "π", legendes: ["π mais en 4K", "le classique. jamais démodé", "π sans filtre, sans retouche"] },
  { valeur: "2,71828182845904…", nom: "e", legendes: ["e, la base (au sens propre)", "il est sa propre dérivée et il le vit bien"] },
  { valeur: "1,41421356237309…", nom: "√2", legendes: ["√2, irrationnel depuis l'Antiquité", "les pythagoriciens détestent ce réel"] },
  { valeur: "1,61803398874989…", nom: "φ", legendes: ["le nombre d'or, rien que ça", "φ, proportions parfaites ✨"] },
  { valeur: "0,69314718055994…", nom: "ln 2", legendes: ["ln 2, discret mais partout", "∑ (−1)ⁿ⁺¹/n, voilà"] },
  { valeur: "0,57721566490153…", nom: "γ", legendes: ["γ : on ne sait même pas s'il est irrationnel 😳", "constante d'Euler–Mascheroni, mystère total"] },
  { valeur: "1,20205690315959…", nom: "ζ(3)", legendes: ["la constante d'Apéry, irrationnelle depuis 1978", "ζ(3) passe enfin dans le fil"] },
  { valeur: "0,99999999999999…", nom: "0,999…", legendes: ["= 1. débat dans les commentaires 👇", "ce réel est 1, il ne le sait pas encore"] },
];

const LEGENDES = [
  "aucun filtre 🔥", "nouveau réel, dites-moi ce que vous en pensez", "tiré au hasard, comme mes notes de DS",
  "il était là avant ℚ", "vu en colle aujourd'hui", "pas rationnel, pas de problème", "trouvé dans un intervalle ouvert",
  "un réel par jour éloigne le khôlleur", "majoré, mais pas par vous", "pov : tu tires un réel uniformément",
  "il n'admet pas de développement décimal fini et il l'assume", "#réels #ℝ #pourtoi", "le TVI m'a ramené ça",
  "en direct de la droite numérique", "ça passe au voisinage, ça s'arrête", "qualité : densité maximale",
];

const COMMENTAIRES = [
  "j'en pleure, quelle densité 😭", "le meilleur réel de la semaine", "Archimède aurait liké",
  "Cauchy approuve ce réel", "je l'ai mis en fond d'écran", "borne supérieure de mon cœur ❤️",
  "{n} c'est littéralement moi", "ça converge 🔥🔥", "pas besoin de l'axiome du choix pour choisir celui-là",
  "Weierstrass serait fier", "plus beau que π (désolé π)", "il est où le contenu dans ℚ ? 👀",
  "j'ai montré {n} à mon colleur, il a pleuré", "ce nombre a changé ma vie", "rien à voir mais {n} 😍",
  "on veut une partie 2", "le cadrage, l'éclairage, les décimales… tout est parfait", "QUELLE VALEUR",
  "{n} > tout le reste", "je l'ai vu en vrai sur la droite réelle, il est encore plus beau", "masterclass",
  "Dedekind a coupé pile au bon endroit", "c'est quand le prochain ?", "ça m'a fait réviser mieux que mes fiches",
  "le son est incroyable aussi", "première ! (je suis le plus petit majorant)", "abonné direct",
  "irrationnel comme mon amour pour ce compte", "j'arrive pas à m'arrêter de scroller ℝ", "pépite",
  "le prof de maths a liké ??", "trop proche de 0 pour moi mais respect", "je le connaissais avant qu'il soit connu",
  "on dirait un DL à l'ordre infini", "ce réel admet une limite : la perfection", "😮‍💨😮‍💨😮‍💨",
];

const DUREES = ["1 min", "4 min", "12 min", "36 min", "1 h", "2 h", "5 h", "9 h", "1 j", "2 j", "3 j", "1 sem"];

const choisir = <T,>(r: Aleatoire, t: readonly T[]): T => t[Math.floor(r() * t.length)];
const entier = (r: Aleatoire, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

/** Partie entière groupée par trois avec une espace fine, virgule décimale. */
export function formatDecimal(signe: string, partieEntiere: string, decimales: string): string {
  const groupee = partieEntiere.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${signe}${groupee}${decimales ? "," + decimales : ""}`;
}

const EXPOSANTS: Record<string, string> = {
  "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};
const exposant = (n: number) => String(n).split("").map((c) => EXPOSANTS[c]).join("");

/** 12 400 → « 12,4 k », 1 230 000 → « 1,2 M ». */
export function formatCompte(n: number): string {
  if (n < 1000) return String(n);
  const [d, s] = n < 1e6 ? [1e3, "k"] : [1e6, "M"];
  const v = n / d;
  return `${(v < 100 ? Math.floor(v * 10) / 10 : Math.floor(v)).toString().replace(".", ",")} ${s}`;
}

function chiffres(r: Aleatoire, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(r() * 10);
  return s;
}

/** Tire un nombre et sa légende éventuellement spécifique. */
function tirerNombre(r: Aleatoire): { valeur: string; sous?: string; legende?: string } {
  const t = r();
  const signe = r() < 0.2 ? "−" : "";
  if (t < 0.38) {
    const ent = String(entier(r, 0, r() < 0.5 ? 99 : 99999));
    return { valeur: formatDecimal(signe, ent, chiffres(r, entier(r, 1, 12))) };
  }
  if (t < 0.5) {
    return { valeur: formatDecimal(signe, String(entier(r, 0, r() < 0.7 ? 999 : 9999999)), "") };
  }
  if (t < 0.6) {
    const zeros = "0".repeat(entier(r, 3, 8));
    return { valeur: formatDecimal(signe, "0", zeros + chiffres(r, entier(r, 1, 4)).replace(/^0/, "1")),
             legende: "minuscule mais costaud" };
  }
  if (t < 0.7) {
    const e = entier(r, -40, 40) || 23;
    const m = `${entier(r, 1, 9)},${chiffres(r, entier(r, 1, 3))}`;
    return { valeur: `${signe}${m} × 10${exposant(e)}`,
             legende: e > 0 ? "ce réel est énorme, faites de la place" : "zoom ×10¹² pour le voir" };
  }
  if (t < 0.8) {
    let n = entier(r, 2, 200);
    while (Number.isInteger(Math.sqrt(n))) n++;
    const v = Math.sqrt(n).toFixed(10).replace(".", ",");
    return { valeur: `√${n}`, sous: `≈ ${v}…`, legende: `√${n}, enfin quelqu'un qui en parle` };
  }
  if (t < 0.83) {
    return choisir(r, [
      { valeur: "0", legende: "le neutre absolu. respect." },
      { valeur: "1", legende: "l'unité. iconique." },
      { valeur: "−1", legende: "e^{iπ} m'a envoyé" },
    ]);
  }
  const c = choisir(r, CONSTANTES);
  return { valeur: c.valeur, sous: c.nom === "0,999…" ? undefined : c.nom, legende: choisir(r, c.legendes) };
}

function autreAuteur(r: Aleatoire, sauf: string): string {
  const a = choisir(r, AUTEURS);
  return a === sauf ? AUTEURS[(AUTEURS.indexOf(a) + 1) % AUTEURS.length] : a;
}

let compteur = 0;
let derniereTeinte = 0;

export function genererReel(r: Aleatoire = Math.random, pseudo?: string): Reel {
  const id = `${Date.now().toString(36)}-${(compteur++).toString(36)}-${Math.floor(r() * 1e9).toString(36)}`;
  const n = tirerNombre(r);
  const auteur = choisir(r, AUTEURS);
  const likes = Math.floor(10 ** (2.3 + r() * 4.2));
  const affiche = n.sous && !n.sous.startsWith("≈") ? n.sous : n.valeur;

  const nb = entier(r, 4, 9);
  const vus = new Set<string>();
  const commentaires: CommentaireReel[] = [];
  for (let i = 0; i < nb; i++) {
    let texte = choisir(r, COMMENTAIRES);
    if (vus.has(texte)) continue;
    vus.add(texte);
    texte = texte.replaceAll("{n}", affiche);
    commentaires.push({
      id: `${id}-c${i}`,
      auteur: autreAuteur(r, auteur),
      texte,
      likes: Math.floor(likes * r() * 0.08),
      ilYa: choisir(r, DUREES),
    });
  }
  if (pseudo && r() < 0.25) {
    commentaires.splice(entier(r, 0, commentaires.length), 0, {
      id: `${id}-tag`, auteur: autreAuteur(r, auteur), texte: `@${pseudo} regarde ça 😭😭`, 
      likes: entier(r, 1, 40), ilYa: choisir(r, DUREES),
    });
  }
  commentaires.sort((a, b) => b.likes - a.likes);

  return {
    id,
    valeur: n.valeur,
    sous: n.sous,
    legende: n.legende && r() < 0.7 ? n.legende : choisir(r, LEGENDES),
    auteur,
    son: r() < 0.6 ? `Son original · ${auteur}` : choisir(r, ["Bruit blanc (uniforme sur [0,1])", "Le TVI (remix)", "Suite harmonique · diverge lentement", "Série de Fourier · lo-fi"]),
    likes,
    partages: Math.floor(likes * (0.02 + r() * 0.1)),
    nbCommentaires: commentaires.length + Math.floor(likes * (0.005 + r() * 0.03)),
    commentaires,
    // Deux réels voisins ne partagent jamais la même ambiance.
    teinte: (derniereTeinte = Math.floor(derniereTeinte + 70 + r() * 220) % 360),
  };
}
