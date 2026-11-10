import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ErreurExpression, TOUTES_FAMILLES, compiler, formeCanonique, lire, verifier, versLatex,
} from "../src/lib/courbes/expression";
import { choisirTir } from "../src/lib/courbes/bots";
import {
  RAYON_JOUEUR, X_MAX, Y_MAX, aleatoire, corrigerReglages, devoiler, genererArene, nouveauVoile,
  REGLAGES_DEFAUT, solide, visible,
} from "../src/lib/courbes/monde";
import { simuler, type Tireur } from "../src/lib/courbes/simulation";
import { agir, creerSalon, lireSalon, lireTraces } from "../src/lib/courbes/salons";

const LIBRE = { familles: TOUTES_FAMILLES, longueurMax: 0, equadiff: false };
const valeur = (source: string, x = 0, y = 0) => compiler(lire(source).arbre)(x, y);
const proche = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("expressions : priorités, produit implicite, puissances", () => {
  proche(valeur("1+2*3"), 7);
  proche(valeur("2x^2", 3), 18);
  proche(valeur("-x^2", 3), -9);
  proche(valeur("2^-x", 1), 0.5);
  proche(valeur("2^3^2"), 512);
  proche(valeur("x(x+1)", 2), 6);
  proche(valeur("(x+1)(x-1)", 3), 8);
  proche(valeur("2sin(x)cos(x)", 0.4), Math.sin(0.8));
  proche(valeur("1/2x", 4), 2);
  proche(valeur("2pi"), 2 * Math.PI);
  proche(valeur("ex", 2), 2 * Math.E);
  proche(valeur("exp(x)", 1), Math.E);
  proche(valeur("3 − x²", 2), -1);
  proche(valeur("SIN(X)", 1), Math.sin(1));
  proche(valeur("max(x, 2) + min(x, 2)", 5), 7);
  proche(valeur("x - y", 5, 3), 2);
});

test("expressions : alias et notations françaises", () => {
  proche(valeur("ch(x)", 1), Math.cosh(1));
  proche(valeur("cosh(x)", 1), Math.cosh(1));
  proche(valeur("atan(x)", 1), Math.PI / 4);
  proche(valeur("log(e)"), 1);
  proche(valeur("√(x)", 9), 3);
});

test("expressions : hors domaine = NaN, jamais d'exception", () => {
  assert.ok(Number.isNaN(valeur("ln(x)", -1)));
  assert.ok(Number.isNaN(valeur("sqrt(x)", -1)));
  assert.ok(Number.isNaN(valeur("1/x", 0)));
  assert.ok(Number.isNaN(valeur("arcsin(x)", 2)));
});

test("expressions : refus en français, rien d'exécutable", () => {
  for (const source of ["", "2+", "sin x", "(x", "x)", "foo(x)", "x;1", "alert(1)", "constructor", "x=>x",
                         "0,5x", "min(x)", "x..2", "process.exit()", "__proto__", "x".repeat(121)]) {
    assert.throws(() => lire(source), ErreurExpression, source);
  }
  assert.throws(() => lire("(".repeat(60) + "x" + ")".repeat(60)), ErreurExpression);
});

test("expressions : règles du salon", () => {
  assert.throws(() => verifier("sin(x)", { ...LIBRE, familles: [] }), /sin n’est pas autorisée/);
  assert.throws(() => verifier("x+y", LIBRE), /équation différentielle/);
  assert.throws(() => verifier("x + x + x + x + x + x", { ...LIBRE, longueurMax: 10 }), /10 caractères/);
  assert.equal(verifier("x^2 - 3x", { ...LIBRE, familles: [] }).source, "x^2 - 3x");
  assert.ok(verifier("y - x", { ...LIBRE, equadiff: true }).utiliseY);
});

test("expressions : écriture LaTeX", () => {
  assert.equal(versLatex(lire("x/2").arbre), "\\frac{x}{2}");
  assert.equal(versLatex(lire("-(x+1)^2").arbre), "-\\left(x+1\\right)^{2}");
  assert.equal(versLatex(lire("2*3").arbre), "2\\times 3");
  assert.equal(versLatex(lire("x*(-2)").arbre), "x\\,\\left(-2\\right)");
  assert.equal(versLatex(lire("x-(1-x)").arbre), "x-\\left(1-x\\right)");
  assert.equal(versLatex(lire("0.5sin(x)").arbre), "0.5\\,\\sin\\left(x\\right)");
  assert.equal(versLatex(lire("-0.3(x-2)^2").arbre), "-0.3\\,\\left(x-2\\right)^{2}");
  assert.equal(formeCanonique(" 2 X ² "), "2x^2");
});

test("arène : joueurs écartés, sur des entiers, hors des obstacles", () => {
  for (let graine = 1; graine <= 40; graine++) {
    for (const n of [2, 5, 10]) {
      const a = genererArene(graine, n, "beaucoup");
      assert.equal(a.positions.length, n);
      for (const [i, p] of a.positions.entries()) {
        assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y));
        assert.ok(Math.abs(p.x) <= X_MAX - 3 && Math.abs(p.y) <= Y_MAX - 3);
        for (const q of a.positions.slice(i + 1)) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > 4);
        for (const o of a.obstacles) assert.ok(Math.hypot(p.x - o.x, p.y - o.y) > o.r + RAYON_JOUEUR + 1);
      }
    }
  }
  assert.deepEqual(genererArene(7, 4, "normal"), genererArene(7, 4, "normal"));
});

const tireur = (id: string, x: number, y: number, source?: string): Tireur =>
  ({ id, x, y, expr: source ? verifier(source, { ...LIBRE, equadiff: true }) : null });

test("simulation : une droite touche sa cible, la courbe part de son auteur", () => {
  const r = simuler([tireur("a", -10, 2, "0.5x"), tireur("b", 10, 12)], [], [], "fonction");
  const e = r.evenements.find((x) => x.type === "elimination");
  assert.ok(e && e.type === "elimination" && e.tueur === "a" && e.victime === "b");
  for (const tr of r.traces) assert.deepEqual(tr.pts.slice(0, 2), [-10, 2]);
  // 20 en x, 10 en y : la cible est touchée à un rayon près de la distance.
  if (e.type === "elimination") assert.ok(Math.abs(e.longueur - (Math.hypot(20, 10) - RAYON_JOUEUR)) < 0.2);
});

test("simulation : même vitesse pour tous, le plus court gagne le duel", () => {
  // a vise b en ligne droite ; b fait un détour sinueux vers a.
  const r = simuler([tireur("a", -8, 0, "0"), tireur("b", 8, 0, "3sin(2x)")], [], [], "fonction");
  const morts = r.evenements.filter((e) => e.type === "elimination").map((e) => e.type === "elimination" && e.victime);
  assert.deepEqual(morts, ["b"]);
  assert.ok(r.traces.filter((t) => t.joueur === "b").some((t) => t.fin === "mort"));
  // Chaque tick avance de la même longueur d'arc sur toutes les courbes.
  for (const tr of r.traces) {
    for (let i = 2; i + 3 < tr.pts.length - 2; i += 2) {
      const d = Math.hypot(tr.pts[i + 2] - tr.pts[i], tr.pts[i + 3] - tr.pts[i + 1]);
      assert.ok(d < 0.2, `pas de ${d}`);
    }
  }
});

test("simulation : tirs croisés au même instant, double élimination", () => {
  const r = simuler([tireur("a", -6, 0, "0"), tireur("b", 6, 0, "0")], [], [], "fonction");
  assert.equal(r.evenements.filter((e) => e.type === "elimination").length, 2);
});

test("simulation : obstacle, cratère, puis passage par le cratère", () => {
  const mur = [{ x: 0, y: 0, r: 2 }];
  const joueurs = () => [tireur("a", -10, 0, "0"), tireur("b", 10, 0)];
  const r1 = simuler(joueurs(), mur, [], "fonction");
  assert.equal(r1.evenements.filter((e) => e.type === "elimination").length, 0);
  assert.equal(r1.crateres.length, 1);
  assert.ok(r1.traces.some((t) => t.fin === "obstacle"));
  let crateres = r1.crateres;
  for (let k = 0; k < 5 && !simuler(joueurs(), mur, crateres, "fonction").evenements.some((e) => e.type === "elimination"); k++) {
    crateres = [...crateres, ...simuler(joueurs(), mur, crateres, "fonction").crateres];
  }
  assert.ok(simuler(joueurs(), mur, crateres, "fonction").evenements.some((e) => e.type === "elimination"));
  assert.ok(!solide(mur, crateres, -1.5, 0));
});

test("simulation : fins de courbe (bord, domaine, rupture)", () => {
  const fin = (source: string, dir: 1 | -1, x = 0, y = 0) =>
    simuler([tireur("a", x, y, source)], [], [], "fonction").traces.find((t) => t.dir === dir)!.fin;
  assert.equal(fin("x", 1), "bord");
  assert.equal(fin("sqrt(x)", -1, 4, 0), "domaine");
  // Une asymptote verticale fait sortir la courbe de l'arène avant de la rompre.
  assert.equal(fin("1/x", -1, 3, 0), "bord");
  assert.equal(fin("0.5sgn(x)", 1, -3, 0), "bord");
  assert.equal(fin("4sgn(x)", 1, -3, 0), "rupture");
  assert.equal(fin("5floor(x/3)", 1), "rupture");
  assert.equal(fin("floor(x/3)", 1), "bord");
  assert.equal(fin("ln(x)", 1, -2, 0), "domaine");
  assert.equal(fin("tan(x)", 1), "bord");
});

test("simulation : équation différentielle y′ = f(x, y)", () => {
  // y′ = y avec y(0) = 1 : y = e^x.
  const r = simuler([tireur("a", 0, 1, "y")], [], [], "equadiff");
  const droite = r.traces.find((t) => t.dir === 1)!;
  for (let i = 0; i < droite.pts.length - 2; i += 2) {
    assert.ok(Math.abs(Math.log(droite.pts[i + 1]) - droite.pts[i]) < 0.02);
  }
  // y′ = −x/y : cercle centré à l'origine, arrêté à la tangente verticale.
  const c = simuler([tireur("a", 0, 5, "-x/y")], [], [], "equadiff");
  for (const tr of c.traces) {
    for (let i = 0; i < tr.pts.length; i += 2) assert.ok(Math.abs(Math.hypot(tr.pts[i], tr.pts[i + 1]) - 5) < 0.05);
    assert.equal(tr.fin, "domaine");
    assert.ok(Math.abs(tr.pts[tr.pts.length - 1]) < 0.1, "arrêt à la tangente verticale");
  }
});

test("bots : expressions valides dans les règles du salon, et souvent mortelles", () => {
  const rnd = aleatoire(3);
  let touches = 0;
  for (const equadiff of [false, true]) {
    for (const familles of [TOUTES_FAMILLES, []]) {
      for (let k = 0; k < 20; k++) {
        const regles = { familles, longueurMax: 0, equadiff };
        const moi = tireur("bot", Math.round(rnd() * 40 - 20), Math.round(rnd() * 20 - 10));
        const cible = tireur("b", Math.round(rnd() * 40 - 20), Math.round(rnd() * 20 - 10));
        const expr = choisirTir(moi, [cible], [], [], regles, rnd);
        if (!expr) continue;
        assert.doesNotThrow(() => verifier(expr.source, regles), expr.source);
        const r = simuler([{ ...moi, expr }, cible], [], [], equadiff ? "equadiff" : "fonction");
        if (r.evenements.some((e) => e.type === "elimination")) touches++;
      }
    }
  }
  assert.ok(touches > 20 && touches < 75, `${touches} tirs au but sur 80`);
});

test("brouillard : la grille ne dévoile que ce qui est proche", () => {
  const voile = nouveauVoile();
  devoiler(voile, 3, -2, 2);
  assert.ok(visible(voile, 3, -2) && visible(voile, 4.5, -2));
  assert.ok(!visible(voile, 6, -2) && !visible(voile, 3, 1));
  assert.ok(!visible(voile, 99, 0));
});

test("réglages : seules les valeurs prévues passent", () => {
  const r = corrigerReglages(REGLAGES_DEFAUT, {
    mode: "brouillard", tir: "nimporte", manches: 99, temps: 45, familles: ["trigo", "eval"], obstacles: "beaucoup",
  });
  assert.equal(r.mode, "brouillard");
  assert.equal(r.tir, "fonction");
  assert.equal(r.manches, REGLAGES_DEFAUT.manches);
  assert.equal(r.temps, 45);
  assert.deepEqual(r.familles, ["trigo"]);
});

test("salon : du salon à la volée, et le brouillard filtre la vue", () => {
  const leo = { id: "11111111-1111-4111-8111-111111111111", nom: "Léo" };
  const code = creerSalon(leo);
  assert.match(code, /^[A-Z0-9]{4}$/);
  assert.throws(() => agir(code, leo, { t: "lancer" }), /au moins deux/);
  agir(code, leo, { t: "bot", delta: 1 });
  agir(code, leo, { t: "bot", delta: 1 });
  agir(code, leo, { t: "reglages", reglages: { mode: "brouillard", manches: 1, familles: [] } });
  assert.throws(() => agir(code, { id: "2", nom: "Zoé" }, { t: "lancer" }), /hôte/);
  agir(code, leo, { t: "exclure", id: "2" });

  let etat = agir(code, leo, { t: "lancer" })!;
  assert.equal(etat.phase, "preparation");
  assert.ok(etat.voile, "sous le brouillard");
  const moi = etat.joueurs.find((p) => p.id === leo.id)!;
  assert.ok(moi.x !== null);
  // Un bot n'est connu que s'il est à portée de vue du départ.
  for (const p of etat.joueurs.filter((x) => x.bot && x.x !== null)) {
    assert.ok(Math.hypot(p.x! - moi.x!, p.y! - moi.y!) < 5);
  }
  assert.throws(() => agir(code, leo, { t: "tirer", expression: "sin(x)" }), /pas autorisée/);
  assert.throws(() => agir(code, leo, { t: "tirer", expression: "2+" }), /fin de l’expression/);

  etat = agir(code, leo, { t: "tirer", expression: "0.1x" })!;
  assert.equal(etat.phase, "volee");
  assert.equal(etat.tir!.expressions.find((e) => e.id === leo.id)!.source, "0.1x");
  assert.equal(etat.monExpression, null);
  assert.equal(etat.historique.length, 1);

  const traces = lireTraces(code, leo)!;
  assert.equal(traces.n, etat.tir!.n);
  assert.equal(traces.traces.filter((t) => t.joueur === leo.id).length, 2);
  // Les courbes adverses n'arrivent que par morceaux, tous proches de mes couloirs.
  const miens = traces.traces.filter((t) => t.joueur === leo.id).flatMap((t) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < t.pts.length; i += 2) pts.push([t.pts[i], t.pts[i + 1]]);
    return pts;
  });
  for (const t of traces.traces.filter((x) => x.joueur !== leo.id)) {
    for (let i = 0; i < t.pts.length; i += 2) {
      const d = Math.min(...miens.map(([x, y]) => Math.hypot(x - t.pts[i], y - t.pts[i + 1])));
      assert.ok(d < 5, `point adverse à ${d} de mes courbes`);
    }
  }
  assert.equal(lireSalon(code, leo).v, etat.v);
  agir(code, leo, { t: "quitter" });
  assert.throws(() => lireSalon(code, leo), /n’existe plus/);
});
