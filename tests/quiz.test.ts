import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerStats, estJuste, melanger, verifierQuiz } from "../src/lib/quiz-commun";

const question = (o: Record<string, unknown> = {}) => ({
  enonce: "Combien vaut $1+1$ ?", explication: "",
  choix: [{ texte: "2", juste: true }, { texte: "3", juste: false }], ...o,
});
const quiz = (o: Record<string, unknown> = {}) => ({ titre: "Arithmétique", description: "", matiere: "", questions: [question()], ...o });

test("verifierQuiz accepte un quiz correct et nettoie les espaces", () => {
  const r = verifierQuiz(quiz({ titre: "  Arithmétique  " }));
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.quiz.titre, "Arithmétique");
});

test("verifierQuiz désigne la question fautive", () => {
  const cas: Array<[unknown, RegExp]> = [
    [quiz({ titre: "a" }), /Titre/],
    [quiz({ questions: [] }), /au moins une question/],
    [quiz({ questions: [question(), question({ enonce: " " })] }), /Question 2 : l’énoncé est vide/],
    [quiz({ questions: [question({ choix: [{ texte: "2", juste: true }] })] }), /de 2 à 6 choix/],
    [quiz({ questions: [question({ choix: [{ texte: "2" }, { texte: "3" }] })] }), /bonne réponse/],
    [quiz({ questions: [question({ choix: [{ texte: "2", juste: true }, { texte: "2" }] })] }), /identiques/],
    [quiz({ questions: [question({ id: 4 }), question({ id: 4 })] }), /Question 2 : invalide/],
    [quiz({ questions: [question({ id: -1 })] }), /invalide/],
    [null, /invalide/],
  ];
  for (const [entree, attendu] of cas) {
    const r = verifierQuiz(entree);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.erreur, attendu);
  }
});

test("estJuste exige exactement les bons choix, dans n'importe quel ordre", () => {
  assert.ok(estJuste([3, 1], [1, 3]));
  assert.ok(!estJuste([1], [1, 3]));
  assert.ok(!estJuste([1, 2, 3], [1, 3]));
  assert.ok(!estJuste([], [1]));
});

test("melanger est déterministe et garde tous les éléments", () => {
  const l = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(melanger(l, 42), melanger(l, 42));
  assert.deepEqual([...melanger(l, 7)].sort(), l);
  assert.deepEqual(l, [1, 2, 3, 4, 5, 6]);
});

test("calculerStats : la classe ne compte que les premiers essais", () => {
  const questions = [{ id: 1, justes: [10], choix: [10, 11] }, { id: 2, justes: [20, 21], choix: [20, 21, 22] }];
  const r = (tentative_id: number, user_id: string, numero: number, question_id: number, choix: number[], fini = true) =>
    ({ tentative_id, user_id, numero, fini, question_id, choix });
  const s = calculerStats(questions, [
    r(1, "a", 1, 1, [10]), r(1, "a", 1, 2, [20]),          // a : 1/2
    r(2, "b", 1, 1, [11]), r(2, "b", 1, 2, [21, 20]),      // b : 1/2
    r(3, "a", 2, 1, [10]), r(3, "a", 2, 2, [20, 21]),      // a, 2e essai : 2/2
    r(4, "c", 1, 1, [10], false),                          // c : en cours
    r(5, "c", 1, 99, [1], false),                          // question retirée : ignorée
  ]);
  assert.equal(s.participants, 2); // c n'a pas fini
  const q1 = s.questions.find((q) => q.id === 1)!;
  assert.deepEqual([q1.repondants, q1.justes, q1.parChoix[10], q1.parChoix[11]], [3, 2, 2, 1]);
  const q2 = s.questions.find((q) => q.id === 2)!;
  assert.deepEqual([q2.repondants, q2.justes], [2, 1]);
  const a = s.membres.find((m) => m.user_id === "a")!;
  assert.deepEqual([a.premiereJustes, a.premiereRepondues, a.tentatives, a.meilleur], [1, 2, 2, 100]);
  assert.deepEqual(a.premiere, { 1: true, 2: false });
  const c = s.membres.find((m) => m.user_id === "c")!;
  assert.equal(c.premiereFinie, false);
  assert.equal(c.meilleur, null);
  assert.equal(s.moyenne, 50);
});
