/*
 * Quiz : règles partagées par le serveur, l'éditeur (client) et les tests.
 * Aucun import serveur ici.
 */

export const LIMITES = {
  titre: 120,
  description: 1000,
  questions: 50,
  enonce: 2000,
  explication: 2000,
  choixMin: 2,
  choixMax: 6,
  texteChoix: 500,
} as const;

export type ChoixSaisi = { id?: number; texte: string; juste: boolean };
export type QuestionSaisie = { id?: number; enonce: string; explication: string; choix: ChoixSaisi[] };
export type QuizSaisi = { titre: string; description: string; matiere: string; questions: QuestionSaisie[] };

const idValide = (v: unknown) => v === undefined || (Number.isSafeInteger(v) && (v as number) > 0);
const texte = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * Relit une saisie venue du client (JSON). Renvoie la saisie nettoyée ou
 * un message en français qui désigne la question fautive.
 */
export function verifierQuiz(brut: unknown): { ok: true; quiz: QuizSaisi } | { ok: false; erreur: string } {
  const non = (erreur: string) => ({ ok: false as const, erreur });
  if (!brut || typeof brut !== "object") return non("Formulaire invalide");
  const b = brut as Record<string, unknown>;
  const titre = texte(b.titre)?.trim() ?? "";
  const description = texte(b.description)?.trim() ?? "";
  const matiere = texte(b.matiere) ?? "";
  if (titre.length < 2 || titre.length > LIMITES.titre) return non(`Titre : 2 à ${LIMITES.titre} caractères`);
  if (description.length > LIMITES.description) return non("Description trop longue");
  if (!Array.isArray(b.questions) || b.questions.length === 0) return non("Ajoute au moins une question");
  if (b.questions.length > LIMITES.questions) return non(`${LIMITES.questions} questions au maximum`);

  const questions: QuestionSaisie[] = [];
  const idsQuestions = new Set<number>();
  const idsChoix = new Set<number>();
  for (const [i, q] of (b.questions as unknown[]).entries()) {
    const n = `Question ${i + 1}`;
    if (!q || typeof q !== "object") return non(`${n} : invalide`);
    const r = q as Record<string, unknown>;
    if (!idValide(r.id) || (r.id !== undefined && idsQuestions.has(r.id as number))) return non(`${n} : invalide`);
    if (r.id !== undefined) idsQuestions.add(r.id as number);
    const enonce = texte(r.enonce)?.trim() ?? "";
    const explication = texte(r.explication)?.trim() ?? "";
    if (!enonce) return non(`${n} : l’énoncé est vide`);
    if (enonce.length > LIMITES.enonce) return non(`${n} : énoncé trop long`);
    if (explication.length > LIMITES.explication) return non(`${n} : explication trop longue`);
    if (!Array.isArray(r.choix)) return non(`${n} : invalide`);
    const choix: ChoixSaisi[] = [];
    for (const c of r.choix as unknown[]) {
      if (!c || typeof c !== "object") return non(`${n} : invalide`);
      const rc = c as Record<string, unknown>;
      if (!idValide(rc.id) || (rc.id !== undefined && idsChoix.has(rc.id as number))) return non(`${n} : invalide`);
      if (rc.id !== undefined) idsChoix.add(rc.id as number);
      const t = texte(rc.texte)?.trim() ?? "";
      if (!t) return non(`${n} : un choix est vide`);
      if (t.length > LIMITES.texteChoix) return non(`${n} : un choix est trop long`);
      choix.push({ ...(rc.id !== undefined ? { id: rc.id as number } : {}), texte: t, juste: rc.juste === true });
    }
    if (choix.length < LIMITES.choixMin || choix.length > LIMITES.choixMax) {
      return non(`${n} : de ${LIMITES.choixMin} à ${LIMITES.choixMax} choix`);
    }
    if (!choix.some((c) => c.juste)) return non(`${n} : coche au moins une bonne réponse`);
    if (new Set(choix.map((c) => c.texte)).size !== choix.length) return non(`${n} : deux choix identiques`);
    questions.push({ ...(r.id !== undefined ? { id: r.id as number } : {}), enonce, explication, choix });
  }
  return { ok: true, quiz: { titre, description, matiere, questions } };
}

/** Une réponse est juste si elle coche exactement les bons choix. */
export function estJuste(choisis: readonly number[], justes: readonly number[]): boolean {
  const a = new Set(choisis);
  const b = new Set(justes);
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/** Mélange déterministe (même graine, même ordre) : l'ordre des choix ne bouge pas au rechargement. */
export function melanger<T>(items: readonly T[], graine: number): T[] {
  let s = graine >>> 0;
  const alea = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pourcent(n: number, total: number): number | null {
  return total > 0 ? Math.round((100 * n) / total) : null;
}

/* --- Statistiques ----------------------------------------------------- */

export type QuestionCorrige = { id: number; justes: number[]; choix: number[] };
export type ReponseBrute = {
  tentative_id: number; user_id: string; numero: number; fini: boolean;
  question_id: number; choix: number[];
};

export type StatQuestion = {
  id: number; repondants: number; justes: number;
  /** Nombre de premières tentatives ayant coché chaque choix. */
  parChoix: Record<number, number>;
};
export type StatMembre = {
  user_id: string;
  /** Première tentative : question → juste ? (absente = pas répondu). */
  premiere: Record<number, boolean>;
  premiereJustes: number; premiereRepondues: number; premiereFinie: boolean;
  tentatives: number;
  /** Meilleur pourcentage parmi les tentatives finies, null s'il n'y en a pas. */
  meilleur: number | null;
};

/**
 * Agrège les réponses d'un quiz. Les questions retirées sont ignorées ;
 * seules les premières tentatives comptent pour la classe, les suivantes
 * n'entrent que dans le « meilleur score » de chacun.
 */
export function calculerStats(questions: readonly QuestionCorrige[], reponses: readonly ReponseBrute[]) {
  const parId = new Map(questions.map((q) => [q.id, q]));
  const stats = new Map<number, StatQuestion>(
    questions.map((q) => [q.id, { id: q.id, repondants: 0, justes: 0, parChoix: Object.fromEntries(q.choix.map((c) => [c, 0])) }]),
  );
  const membres = new Map<string, StatMembre>();
  const tentatives = new Map<number, { user_id: string; fini: boolean; justes: number; repondues: number }>();

  for (const r of reponses) {
    const q = parId.get(r.question_id);
    if (!q) continue;
    const juste = estJuste(r.choix, q.justes);
    let m = membres.get(r.user_id);
    if (!m) {
      m = { user_id: r.user_id, premiere: {}, premiereJustes: 0, premiereRepondues: 0, premiereFinie: false, tentatives: 0, meilleur: null };
      membres.set(r.user_id, m);
    }
    let t = tentatives.get(r.tentative_id);
    if (!t) {
      t = { user_id: r.user_id, fini: r.fini, justes: 0, repondues: 0 };
      tentatives.set(r.tentative_id, t);
      m.tentatives++;
    }
    t.repondues++;
    if (juste) t.justes++;
    if (r.numero === 1) {
      const s = stats.get(q.id)!;
      s.repondants++;
      if (juste) s.justes++;
      for (const c of new Set(r.choix)) if (c in s.parChoix) s.parChoix[c]++;
      m.premiere[q.id] = juste;
      m.premiereRepondues++;
      if (juste) m.premiereJustes++;
      m.premiereFinie = r.fini;
    }
  }
  for (const t of tentatives.values()) {
    if (!t.fini) continue;
    const m = membres.get(t.user_id)!;
    const p = pourcent(t.justes, t.repondues) ?? 0;
    m.meilleur = Math.max(m.meilleur ?? 0, p);
  }

  // Moyenne et participants : premiers essais terminés seulement (un essai
  // en cours fausserait la moyenne). Les questions comptent toute réponse.
  const classe = [...membres.values()].filter((m) => m.premiereFinie && m.premiereRepondues > 0);
  const moyenne = classe.length
    ? Math.round(classe.reduce((s, m) => s + (100 * m.premiereJustes) / m.premiereRepondues, 0) / classe.length)
    : null;
  return { questions: [...stats.values()], membres: [...membres.values()], participants: classe.length, moyenne };
}
