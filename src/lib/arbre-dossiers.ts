import { PROFONDEUR_MAX_DOSSIERS, type KindDossier } from "./constantes";

/*
 * Arborescence des dossiers, en mémoire.
 *
 * Une classe n'a que quelques dizaines de dossiers : on charge la liste
 * complète d'un type et on la parcourt ici, plutôt que d'écrire des
 * requêtes récursives. Aucun import serveur : utilisable côté client.
 */

export type DossierBase = {
  id: number;
  parent_id: number | null;
  subject_id: number | null;
  nom: string;
  /** Position de la matière : classe les dossiers racines entre eux. */
  rang?: number;
  /** Nom de la matière, pour préfixer les racines dans un menu. */
  matiere?: string | null;
};

export type Noeud<T extends DossierBase> = T & { enfants: Noeud<T>[] };

const collateur = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
export const comparerNoms = (a: string, b: string) => collateur.compare(a, b);

export function construireArbre<T extends DossierBase>(dossiers: T[]): Noeud<T>[] {
  const parId = new Map<number, Noeud<T>>();
  for (const d of dossiers) parId.set(d.id, { ...d, enfants: [] });
  const racines: Noeud<T>[] = [];
  for (const n of parId.values()) {
    const parent = n.parent_id === null ? undefined : parId.get(n.parent_id);
    (parent ? parent.enfants : racines).push(n);
  }
  const trier = (liste: Noeud<T>[]) => {
    liste.sort((a, b) => (a.rang ?? 0) - (b.rang ?? 0) || comparerNoms(a.nom, b.nom));
    for (const n of liste) trier(n.enfants);
  };
  trier(racines);
  return racines;
}

/** De la racine au dossier lui-même. Vide si l'id est inconnu. */
export function chemin<T extends DossierBase>(dossiers: T[], id: number | null): T[] {
  const parId = new Map(dossiers.map((d) => [d.id, d]));
  const out: T[] = [];
  const vus = new Set<number>();
  for (let cur = id === null ? undefined : parId.get(id); cur && !vus.has(cur.id);
       cur = cur.parent_id === null ? undefined : parId.get(cur.parent_id)) {
    vus.add(cur.id);
    out.unshift(cur);
  }
  return out;
}

/** Identifiants de tous les dossiers sous `id` (lui-même exclu). */
export function descendants<T extends DossierBase>(dossiers: T[], id: number): Set<number> {
  const enfantsDe = new Map<number, number[]>();
  for (const d of dossiers) {
    if (d.parent_id === null) continue;
    enfantsDe.set(d.parent_id, [...(enfantsDe.get(d.parent_id) ?? []), d.id]);
  }
  const out = new Set<number>();
  const pile = [...(enfantsDe.get(id) ?? [])];
  while (pile.length) {
    const cur = pile.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    pile.push(...(enfantsDe.get(cur) ?? []));
  }
  return out;
}

/** Niveaux sous `id`, lui compris : un dossier sans sous-dossier vaut 1. */
export function hauteur<T extends DossierBase>(dossiers: T[], id: number): number {
  const enfants = dossiers.filter((d) => d.parent_id === id);
  return 1 + Math.max(0, ...enfants.map((e) => hauteur(dossiers, e.id)));
}

export type OptionDestination = { id: number | null; libelle: string; niveau: number };

/**
 * Destinations proposées pour ranger quelque chose : la racine, puis
 * chaque dossier avec son indentation. Pour déplacer un dossier, on
 * exclut lui-même et son contenu (pas de cycle) et on écarte les
 * destinations qui feraient dépasser la profondeur maximale.
 */
export function destinations<T extends DossierBase>(
  dossiers: T[],
  { deplace = null, racine = "Aucun dossier", avecMatiere = false }:
    { deplace?: number | null; racine?: string; avecMatiere?: boolean } = {},
): OptionDestination[] {
  const interdits = deplace === null ? new Set<number>()
    : new Set<number>([deplace, ...descendants(dossiers, deplace)]);
  const hauteurDeplace = deplace === null ? 0 : hauteur(dossiers, deplace);
  const options: OptionDestination[] = [{ id: null, libelle: racine, niveau: 0 }];

  const parcourir = (liste: Noeud<T>[], niveau: number) => {
    for (const n of liste) {
      if (interdits.has(n.id)) continue;
      // Le contenu déplacé occupe les niveaux niveau+1 … niveau+hauteurDeplace
      // quand on le range DANS n ; un élément simple (hauteur 0) rentre toujours.
      if (niveau + hauteurDeplace <= PROFONDEUR_MAX_DOSSIERS) {
        const prefixe = avecMatiere && niveau === 1 && n.matiere ? `${n.matiere} › ` : "";
        options.push({ id: n.id, libelle: prefixe + n.nom, niveau });
      }
      parcourir(n.enfants, niveau + 1);
    }
  };
  parcourir(construireArbre(dossiers), 1);
  return options;
}

/** « Mathématiques › Analyse » — pour afficher où se trouve un élément. */
export function libelleChemin<T extends DossierBase>(dossiers: T[], id: number | null): string {
  return chemin(dossiers, id).map((d) => d.nom).join(" › ");
}

/** Ce qu'il faut à l'interface pour gérer un dossier (menu « … »). */
export type GestionDossier = {
  id: number;
  kind: KindDossier;
  nom: string;
  /** Dossier racine : sa matière se choisit. */
  racine: boolean;
  subjectId: number | null;
  parentId: number | null;
  /** Renommer, déplacer, supprimer : créateur ou administrateur. */
  peutModifier: boolean;
  /** Sous-dossier possible : la profondeur maximale n'est pas atteinte. */
  peutCreerEnfant: boolean;
  matieres: Array<{ id: number; nom: string }>;
  destinations: OptionDestination[];
};
