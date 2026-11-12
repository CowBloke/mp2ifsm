import "server-only";
import type { PoolClient } from "pg";
import { query, queryOne, tx } from "./db";
import { ErreurMetier } from "./errors";
import { matiereDuFormulaire } from "./matieres";
import { rendreContenu } from "./rendu";
import type { Utilisateur } from "./session";
import {
  calculerStats, estJuste, melanger, pourcent,
  type QuestionCorrige, type QuizSaisi, type ReponseBrute,
} from "./quiz-commun";

/*
 * Quiz (QCM) écrits par la classe. N'importe quel membre crée un quiz ;
 * l'auteur ou un administrateur le modifie ou le retire. Les réponses
 * données sont visibles de la classe (c'est annoncé avant de commencer).
 *
 * La justesse n'est jamais stockée : elle se recalcule contre les choix
 * justes actuels (voir db/schema-dossiers.sql). Le corrigé ne part vers le
 * navigateur qu'une fois la question répondue.
 */

/** Choix justes (triés) de chaque question active : la base de tout calcul de score. */
const CORRIGE = `
  corrige as (
    select q.id, q.quiz_id,
           coalesce(array_agg(c.id order by c.id) filter (where c.juste and c.supprime_le is null), '{}') as justes
      from quiz_question q
      left join quiz_choix c on c.question_id = q.id
     where q.supprime_le is null
     group by q.id
  ),
  notes as (
    select t.id, t.quiz_id, t.user_id, t.numero, t.debut_le, t.fini_le,
           count(k.id)::int as repondues,
           count(k.id) filter (
             where (select coalesce(array_agg(x order by x), '{}') from unnest(r.choix) x) = k.justes
           )::int as justes
      from quiz_tentative t
      left join quiz_reponse r on r.tentative_id = t.id
      left join corrige k on k.id = r.question_id
     group by t.id
  )`;

function idValide(id: unknown): id is number {
  return Number.isSafeInteger(id) && (id as number) > 0;
}

/* --- Lecture ------------------------------------------------------------ */

export type QuizListe = {
  id: number; titre: string; description: string;
  subject_id: number | null; matiere: string | null; couleur: string | null;
  auteur: string; cree_le: string;
  nb_questions: number; participants: number;
  en_cours: boolean;
  /** Pourcentage de ma première tentative finie, null si jamais fini. */
  mon_score: number | null;
};

export async function listerQuiz(userId: string, matiere: number | null): Promise<QuizListe[]> {
  return query<QuizListe>(
    `with ${CORRIGE}
     select z.id, z.titre, z.description, z.subject_id, s.nom as matiere, s.couleur,
            u.display_name as auteur, z.cree_le,
            (select count(*)::int from quiz_question q where q.quiz_id = z.id and q.supprime_le is null) as nb_questions,
            (select count(distinct n.user_id)::int from notes n
              where n.quiz_id = z.id and n.numero = 1 and n.fini_le is not null) as participants,
            exists (select 1 from quiz_tentative t
                     where t.quiz_id = z.id and t.user_id = $1::uuid and t.fini_le is null) as en_cours,
            (select round(100.0 * n.justes / nullif(n.repondues, 0))::int from notes n
              where n.quiz_id = z.id and n.user_id = $1::uuid and n.fini_le is not null
              order by n.numero limit 1) as mon_score
       from quiz z
       join app_user u on u.id = z.created_by
       left join subject s on s.id = z.subject_id
      where z.supprime_le is null and ($2::int is null or z.subject_id = $2)
      order by z.cree_le desc`,
    [userId, matiere],
  );
}

/** Ma réussite par matière, sur les premières tentatives seulement. */
export async function maReussiteParMatiere(userId: string) {
  return query<{ matiere: string | null; couleur: string | null; justes: number; repondues: number }>(
    `with ${CORRIGE}
     select s.nom as matiere, s.couleur, sum(n.justes)::int as justes, sum(n.repondues)::int as repondues
       from notes n
       join quiz z on z.id = n.quiz_id and z.supprime_le is null
       left join subject s on s.id = z.subject_id
      where n.user_id = $1::uuid and n.numero = 1
      group by s.id, s.nom, s.couleur, s.position
     having sum(n.repondues) > 0
      order by s.position nulls last, s.nom`,
    [userId],
  );
}

export type QuizInfos = {
  id: number; titre: string; description: string;
  subject_id: number | null; matiere: string | null; couleur: string | null;
  created_by: string; auteur: string; cree_le: string; nb_questions: number;
};

export async function lireQuiz(id: number): Promise<QuizInfos | null> {
  if (!idValide(id)) return null;
  return queryOne<QuizInfos>(
    `select z.id, z.titre, z.description, z.subject_id, s.nom as matiere, s.couleur,
            z.created_by, u.display_name as auteur, z.cree_le,
            (select count(*)::int from quiz_question q where q.quiz_id = z.id and q.supprime_le is null) as nb_questions
       from quiz z
       join app_user u on u.id = z.created_by
       left join subject s on s.id = z.subject_id
      where z.id = $1 and z.supprime_le is null`,
    [id],
  );
}

export function peutModifier(u: Utilisateur, q: { created_by: string }): boolean {
  return u.role === "admin" || q.created_by === u.id;
}

/** Contenu complet, corrigé compris : pour l'éditeur et les statistiques. */
export async function questionsQuiz(quizId: number) {
  const questions = await query<{ id: number; enonce: string; explication: string }>(
    `select id, enonce, explication from quiz_question
      where quiz_id = $1 and supprime_le is null order by position, id`,
    [quizId],
  );
  const choix = await query<{ id: number; question_id: number; texte: string; juste: boolean }>(
    `select c.id, c.question_id, c.texte, c.juste
       from quiz_choix c join quiz_question q on q.id = c.question_id
      where q.quiz_id = $1 and q.supprime_le is null and c.supprime_le is null
      order by c.position, c.id`,
    [quizId],
  );
  return questions.map((q) => ({ ...q, choix: choix.filter((c) => c.question_id === q.id) }));
}

export type Tentative = { id: number; numero: number; debut_le: string; fini_le: string | null; justes: number; repondues: number };

export async function mesTentatives(userId: string, quizId: number): Promise<Tentative[]> {
  return query<Tentative>(
    `with ${CORRIGE}
     select id, numero, debut_le, fini_le, justes, repondues
       from notes where quiz_id = $1 and user_id = $2::uuid order by numero desc`,
    [quizId, userId],
  );
}

/* --- Écriture du quiz ------------------------------------------------------ */

async function verrouillerPourModif(c: PoolClient, u: Utilisateur, id: number) {
  const r = await c.query<{ created_by: string }>(
    `select created_by from quiz where id = $1 and supprime_le is null for update`, [id],
  );
  if (!r.rows[0]) throw new ErreurMetier("QUIZ_INTROUVABLE");
  if (!peutModifier(u, r.rows[0])) throw new ErreurMetier("NON_AUTORISE");
}

/**
 * Crée (id null) ou réécrit un quiz entier. Les questions et choix gardent
 * leur id quand l'éditeur le renvoie ; ceux qui manquent sont masqués, ce
 * qui garde intactes les réponses déjà données aux autres.
 */
export async function enregistrerQuiz(u: Utilisateur, id: number | null, saisie: QuizSaisi): Promise<number> {
  return tx(async (c) => {
    const matiere = await matiereDuFormulaireOuActuelle(c, id, saisie.matiere);
    let quizId: number;
    if (id === null) {
      const r = await c.query<{ id: number }>(
        `insert into quiz (titre, description, subject_id, created_by) values ($1,$2,$3,$4::uuid) returning id`,
        [saisie.titre, saisie.description, matiere, u.id],
      );
      quizId = r.rows[0].id;
    } else {
      if (!idValide(id)) throw new ErreurMetier("QUIZ_INTROUVABLE");
      await verrouillerPourModif(c, u, id);
      await c.query(
        `update quiz set titre = $2, description = $3, subject_id = $4, modifie_le = now() where id = $1`,
        [id, saisie.titre, saisie.description, matiere],
      );
      quizId = id;
    }

    const existantes = new Set((await c.query<{ id: number }>(
      `select id from quiz_question where quiz_id = $1 and supprime_le is null`, [quizId],
    )).rows.map((r) => r.id));
    const gardees: number[] = [];

    for (const [pos, q] of saisie.questions.entries()) {
      let qid: number;
      if (q.id !== undefined) {
        if (!existantes.has(q.id)) throw new ErreurMetier("QUIZ_INVALIDE");
        await c.query(
          `update quiz_question set position = $2, enonce = $3, explication = $4 where id = $1`,
          [q.id, pos, q.enonce, q.explication],
        );
        qid = q.id;
      } else {
        qid = (await c.query<{ id: number }>(
          `insert into quiz_question (quiz_id, position, enonce, explication) values ($1,$2,$3,$4) returning id`,
          [quizId, pos, q.enonce, q.explication],
        )).rows[0].id;
      }
      gardees.push(qid);

      const choixExistants = new Set((await c.query<{ id: number }>(
        `select id from quiz_choix where question_id = $1 and supprime_le is null`, [qid],
      )).rows.map((r) => r.id));
      const choixGardes: number[] = [];
      for (const [cpos, ch] of q.choix.entries()) {
        if (ch.id !== undefined) {
          if (!choixExistants.has(ch.id)) throw new ErreurMetier("QUIZ_INVALIDE");
          await c.query(
            `update quiz_choix set position = $2, texte = $3, juste = $4 where id = $1`,
            [ch.id, cpos, ch.texte, ch.juste],
          );
          choixGardes.push(ch.id);
        } else {
          choixGardes.push((await c.query<{ id: number }>(
            `insert into quiz_choix (question_id, position, texte, juste) values ($1,$2,$3,$4) returning id`,
            [qid, cpos, ch.texte, ch.juste],
          )).rows[0].id);
        }
      }
      await c.query(
        `update quiz_choix set supprime_le = now()
          where question_id = $1 and supprime_le is null and not (id = any($2::int[]))`,
        [qid, choixGardes],
      );
    }
    await c.query(
      `update quiz_question set supprime_le = now()
        where quiz_id = $1 and supprime_le is null and not (id = any($2::int[]))`,
      [quizId, gardees],
    );
    // Une question ajoutée ne rouvre pas les tentatives finies ; une
    // question retirée peut en revanche achever une tentative en cours.
    await terminerTentativesCompletes(c, quizId);
    return quizId;
  });
}

/** Une matière archivée depuis reste acceptée si on n'y touche pas (comme les échéances). */
async function matiereDuFormulaireOuActuelle(c: PoolClient, id: number | null, brut: string) {
  if (id !== null && idValide(id) && brut !== "") {
    const r = await c.query<{ subject_id: number | null }>(`select subject_id from quiz where id = $1`, [id]);
    if (r.rows[0]?.subject_id != null && String(r.rows[0].subject_id) === brut) return r.rows[0].subject_id;
  }
  return matiereDuFormulaire(brut, c);
}

async function terminerTentativesCompletes(c: PoolClient, quizId: number) {
  await c.query(
    `update quiz_tentative t set fini_le = now()
      where t.quiz_id = $1 and t.fini_le is null
        and not exists (
          select 1 from quiz_question q
           where q.quiz_id = t.quiz_id and q.supprime_le is null
             and not exists (select 1 from quiz_reponse r where r.tentative_id = t.id and r.question_id = q.id))`,
    [quizId],
  );
}

export async function retirerQuiz(u: Utilisateur, id: number): Promise<void> {
  if (!idValide(id)) throw new ErreurMetier("QUIZ_INTROUVABLE");
  await tx(async (c) => {
    await verrouillerPourModif(c, u, id);
    await c.query(`update quiz set supprime_le = now() where id = $1`, [id]);
  });
}

/* --- Jeu ------------------------------------------------------------------ */

export type QuestionJeu = {
  tentativeId: number;
  questionId: number;
  /** Rang de la question dans le quiz (1-based) et nombre total. */
  rang: number; total: number;
  enonceHtml: string;
  plusieurs: boolean;
  choix: Array<{ id: number; html: string }>;
};

/** Démarre une tentative, ou renvoie celle en cours. */
export async function commencerTentative(u: Utilisateur, quizId: number): Promise<number> {
  const quiz = await lireQuiz(quizId);
  if (!quiz) throw new ErreurMetier("QUIZ_INTROUVABLE");
  if (quiz.nb_questions === 0) throw new ErreurMetier("QUIZ_VIDE");
  return tx(async (c) => {
    // Sérialise les démarrages d'un même membre sur ce quiz.
    await c.query(`select pg_advisory_xact_lock(hashtext('quiz:' || $1 || ':' || $2))`, [quizId, u.id]);
    const enCours = await c.query<{ id: number }>(
      `select id from quiz_tentative where quiz_id = $1 and user_id = $2::uuid and fini_le is null`,
      [quizId, u.id],
    );
    if (enCours.rows[0]) return enCours.rows[0].id;
    return (await c.query<{ id: number }>(
      `insert into quiz_tentative (quiz_id, user_id, numero)
       values ($1, $2::uuid, coalesce((select max(numero) from quiz_tentative where quiz_id = $1 and user_id = $2::uuid), 0) + 1)
       returning id`,
      [quizId, u.id],
    )).rows[0].id;
  });
}

/** Prochaine question non répondue de la tentative en cours, ou null. */
export async function questionSuivante(userId: string, quizId: number): Promise<QuestionJeu | null> {
  const t = await queryOne<{ id: number }>(
    `select id from quiz_tentative where quiz_id = $1 and user_id = $2::uuid and fini_le is null`,
    [quizId, userId],
  );
  if (!t) return null;
  const questions = await query<{ id: number; enonce: string; repondue: boolean }>(
    `select q.id, q.enonce,
            exists (select 1 from quiz_reponse r where r.tentative_id = $2 and r.question_id = q.id) as repondue
       from quiz_question q
      where q.quiz_id = $1 and q.supprime_le is null
      order by q.position, q.id`,
    [quizId, t.id],
  );
  const i = questions.findIndex((q) => !q.repondue);
  if (i < 0) return null;
  const q = questions[i];
  const choix = await query<{ id: number; texte: string; juste: boolean }>(
    `select id, texte, juste from quiz_choix where question_id = $1 and supprime_le is null order by position, id`,
    [q.id],
  );
  return {
    tentativeId: t.id, questionId: q.id, rang: i + 1, total: questions.length,
    enonceHtml: rendreContenu(q.enonce),
    plusieurs: choix.filter((c) => c.juste).length > 1,
    choix: melanger(choix, t.id * 7919 + q.id).map((c) => ({ id: c.id, html: rendreContenu(c.texte) })),
  };
}

export type Correction = {
  juste: boolean;
  justes: number[];
  explicationHtml: string | null;
  /** Réussite de la classe à cette question (premières tentatives). */
  reussiteClasse: number | null;
  suivante: QuestionJeu | null;
  bilan: { justes: number; repondues: number; numero: number } | null;
};

export async function repondre(
  u: Utilisateur, tentativeId: number, questionId: number, choixBrut: unknown,
): Promise<Correction> {
  if (!idValide(tentativeId) || !idValide(questionId)) throw new ErreurMetier("QUIZ_INTROUVABLE");
  if (!Array.isArray(choixBrut) || choixBrut.length === 0 || !choixBrut.every(idValide)) {
    throw new ErreurMetier("QUIZ_CHOIX_MANQUANT");
  }
  const choisis = [...new Set(choixBrut as number[])].sort((a, b) => a - b);

  const { quizId, fini } = await tx(async (c) => {
    const t = (await c.query<{ quiz_id: number; fini_le: string | null }>(
      `select quiz_id, fini_le from quiz_tentative where id = $1 and user_id = $2::uuid for update`,
      [tentativeId, u.id],
    )).rows[0];
    if (!t) throw new ErreurMetier("QUIZ_INTROUVABLE");
    if (t.fini_le) throw new ErreurMetier("QUIZ_DEJA_REPONDU");
    const q = (await c.query(
      `select 1 from quiz_question where id = $1 and quiz_id = $2 and supprime_le is null`, [questionId, t.quiz_id],
    )).rowCount;
    if (!q) throw new ErreurMetier("QUIZ_INTROUVABLE");
    const valides = (await c.query(
      `select id from quiz_choix where question_id = $1 and supprime_le is null and id = any($2::int[])`,
      [questionId, choisis],
    )).rowCount;
    if (valides !== choisis.length) throw new ErreurMetier("QUIZ_CHOIX_MANQUANT");
    const ins = await c.query(
      `insert into quiz_reponse (tentative_id, question_id, choix) values ($1,$2,$3::int[])
       on conflict do nothing`,
      [tentativeId, questionId, choisis],
    );
    if (!ins.rowCount) throw new ErreurMetier("QUIZ_DEJA_REPONDU");
    await terminerTentativesCompletes(c, t.quiz_id);
    const f = (await c.query<{ fini: boolean }>(
      `select fini_le is not null as fini from quiz_tentative where id = $1`, [tentativeId],
    )).rows[0].fini;
    return { quizId: t.quiz_id, fini: f };
  });

  const corrige = await queryOne<{ justes: number[]; explication: string }>(
    `select coalesce(array_agg(c.id order by c.id) filter (where c.juste), '{}') as justes, q.explication
       from quiz_question q left join quiz_choix c on c.question_id = q.id and c.supprime_le is null
      where q.id = $1 group by q.id`,
    [questionId],
  );
  const classe = await reussiteQuestion(questionId);
  let bilan: Correction["bilan"] = null;
  if (fini) {
    bilan = await queryOne<{ justes: number; repondues: number; numero: number }>(
      `with ${CORRIGE} select justes, repondues, numero from notes where id = $1`, [tentativeId],
    );
  }
  return {
    juste: estJuste(choisis, corrige?.justes ?? []),
    justes: corrige?.justes ?? [],
    explicationHtml: corrige?.explication ? rendreContenu(corrige.explication) : null,
    reussiteClasse: classe,
    suivante: fini ? null : await questionSuivante(u.id, quizId),
    bilan,
  };
}

async function reussiteQuestion(questionId: number): Promise<number | null> {
  const r = await queryOne<{ n: number; justes: number }>(
    `with k as (
       select coalesce(array_agg(id order by id) filter (where juste), '{}') as justes
         from quiz_choix where question_id = $1 and supprime_le is null
     )
     select count(*)::int as n,
            count(*) filter (where (select coalesce(array_agg(x order by x), '{}') from unnest(r.choix) x) = k.justes)::int as justes
       from quiz_reponse r
       join quiz_tentative t on t.id = r.tentative_id and t.numero = 1, k
      where r.question_id = $1`,
    [questionId],
  );
  return r ? pourcent(r.justes, r.n) : null;
}

/* --- Statistiques ------------------------------------------------------------ */

/** Les statistiques révèlent le corrigé : réservées à qui a fini une tentative, à l'auteur et aux admins. */
export async function peutVoirStats(u: Utilisateur, quiz: QuizInfos): Promise<boolean> {
  if (peutModifier(u, quiz)) return true;
  return !!(await queryOne(
    `select 1 from quiz_tentative where quiz_id = $1 and user_id = $2::uuid and fini_le is not null limit 1`,
    [quiz.id, u.id],
  ));
}

export async function statsQuiz(quizId: number) {
  const questions = await questionsQuiz(quizId);
  const corriges: QuestionCorrige[] = questions.map((q) => ({
    id: q.id,
    justes: q.choix.filter((c) => c.juste).map((c) => c.id),
    choix: q.choix.map((c) => c.id),
  }));
  const reponses = await query<ReponseBrute>(
    `select r.tentative_id, t.user_id, t.numero, t.fini_le is not null as fini, r.question_id, r.choix
       from quiz_reponse r join quiz_tentative t on t.id = r.tentative_id
      where t.quiz_id = $1
      order by t.numero, r.repondu_le`,
    [quizId],
  );
  const noms = new Map((await query<{ id: string; display_name: string }>(
    `select distinct u.id, u.display_name from quiz_tentative t join app_user u on u.id = t.user_id where t.quiz_id = $1`,
    [quizId],
  )).map((r) => [r.id, r.display_name]));
  const stats = calculerStats(corriges, reponses);
  return {
    ...stats,
    contenu: questions.map((q) => ({
      id: q.id,
      enonceHtml: rendreContenu(q.enonce),
      explicationHtml: q.explication ? rendreContenu(q.explication) : null,
      choix: q.choix.map((c) => ({ id: c.id, juste: c.juste, html: rendreContenu(c.texte) })),
    })),
    membres: stats.membres
      .map((m) => ({ ...m, nom: noms.get(m.user_id) ?? "Ancien membre" }))
      // Essais terminés d'abord, par score ; les essais en cours ensuite.
      .sort((a, b) =>
        Number(b.premiereFinie) - Number(a.premiereFinie)
        || (b.premiereRepondues ? b.premiereJustes / b.premiereRepondues : -1)
         - (a.premiereRepondues ? a.premiereJustes / a.premiereRepondues : -1)
        || a.nom.localeCompare(b.nom, "fr")),
  };
}
