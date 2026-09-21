/*
 * Jeu de données du portail : paquets de fiches, historique de
 * révision, documents et échéances.
 *
 *   DATABASE_URL=... npx tsx scripts/seed-portal.ts [--reset]
 *
 * Complète scripts/seed.ts (comptes + marché), qui doit avoir été
 * exécuté avant. L'historique de révision est produit avec ts-fsrs,
 * donc les états créés sont exactement ceux qu'auraient produits de
 * vraies sessions.
 */

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from "ts-fsrs";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL manquant"); process.exit(1); }

const RACINE = process.env.STORAGE_ROOT ?? "/home/cowbloke/mp2ifsm-data";
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const reset = process.argv.includes("--reset");

let graine = 424242;
const alea = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const entre = (a: number, b: number) => Math.floor(alea() * (b - a + 1)) + a;

const moteur = fsrs(generatorParameters({ enable_fuzz: false }));
const ETATS = ["New", "Learning", "Review", "Relearning"] as const;

type SpecPaquet = {
  titre: string; matiere: string; chapitre: string; description: string;
  cartes: Array<[string, string]>;
};

const PAQUETS: SpecPaquet[] = [
  {
    titre: "Dérivées usuelles", matiere: "Maths", chapitre: "Analyse — dérivation",
    description: "Les dérivées à connaître par cœur pour les colles.",
    cartes: [
      ["Dérivée de $\\tan x$ ?", "$1 + \\tan^2 x = \\dfrac{1}{\\cos^2 x}$"],
      ["Dérivée de $\\arctan x$ ?", "$\\dfrac{1}{1+x^2}$"],
      ["Dérivée de $\\arcsin x$ ?", "$\\dfrac{1}{\\sqrt{1-x^2}}$ sur $]-1,1[$"],
      ["Dérivée de $\\ln|u|$ ?", "$\\dfrac{u'}{u}$"],
      ["Dérivée de $x \\mapsto x^x$ sur $\\mathbb{R}_+^*$ ?",
       "$x^x(\\ln x + 1)$ — on écrit $x^x = e^{x\\ln x}$."],
      ["Dérivée de $\\operatorname{ch} x$ ?", "$\\operatorname{sh} x$"],
      ["Dérivée de $\\operatorname{th} x$ ?",
       "$1 - \\operatorname{th}^2 x = \\dfrac{1}{\\operatorname{ch}^2 x}$"],
    ],
  },
  {
    titre: "Développements limités", matiere: "Maths", chapitre: "Analyse — DL",
    description: "DL usuels en 0, à l'ordre demandé en colle.",
    cartes: [
      ["DL de $e^x$ en 0 à l'ordre $n$",
       "$$e^x = \\sum_{k=0}^{n} \\frac{x^k}{k!} + o(x^n)$$"],
      ["DL de $\\ln(1+x)$ en 0 à l'ordre $n$",
       "$$\\ln(1+x) = \\sum_{k=1}^{n} \\frac{(-1)^{k-1}}{k}x^k + o(x^n)$$"],
      ["DL de $\\cos x$ à l'ordre 4", "$1 - \\dfrac{x^2}{2} + \\dfrac{x^4}{24} + o(x^4)$"],
      ["DL de $(1+x)^\\alpha$ à l'ordre 2",
       "$1 + \\alpha x + \\dfrac{\\alpha(\\alpha-1)}{2}x^2 + o(x^2)$"],
      ["DL de $\\tan x$ à l'ordre 3", "$x + \\dfrac{x^3}{3} + o(x^3)$"],
    ],
  },
  {
    titre: "Théorèmes d'analyse", matiere: "Maths", chapitre: "Analyse — théorèmes",
    description: "Énoncés exacts, hypothèses comprises.",
    cartes: [
      ["Théorème de Rolle — énoncé",
       "Si $f$ est continue sur $[a,b]$, dérivable sur $]a,b[$ et $f(a)=f(b)$, alors il existe $c \\in\\ ]a,b[$ tel que $f'(c)=0$."],
      ["Théorème des accroissements finis",
       "Si $f$ continue sur $[a,b]$ et dérivable sur $]a,b[$, il existe $c\\in\\ ]a,b[$ tel que $f(b)-f(a) = f'(c)(b-a)$."],
      ["Théorème de la bijection",
       "Si $f$ est continue et strictement monotone sur un intervalle $I$, alors $f$ réalise une bijection de $I$ sur $f(I)$, et $f^{-1}$ est continue et de même monotonie."],
      ["Inégalité de Cauchy-Schwarz",
       "$$|\\langle x, y\\rangle| \\leq \\|x\\|\\,\\|y\\|$$ avec égalité si et seulement si $x$ et $y$ sont colinéaires."],
    ],
  },
  {
    titre: "Électrocinétique", matiere: "Physique", chapitre: "Circuits — régime transitoire",
    description: "Régimes transitoires du premier et du second ordre.",
    cartes: [
      ["Constante de temps d'un circuit RC", "$\\tau = RC$"],
      ["Constante de temps d'un circuit RL", "$\\tau = \\dfrac{L}{R}$"],
      ["Facteur de qualité d'un RLC série",
       "$$Q = \\frac{1}{R}\\sqrt{\\frac{L}{C}}$$"],
      ["Pulsation propre d'un RLC", "$\\omega_0 = \\dfrac{1}{\\sqrt{LC}}$"],
      ["Énergie stockée dans un condensateur", "$E = \\dfrac{1}{2}CU^2$"],
      ["Énergie stockée dans une bobine", "$E = \\dfrac{1}{2}LI^2$"],
    ],
  },
  {
    titre: "Thermodynamique — bases", matiere: "Physique", chapitre: "Thermodynamique",
    description: "Premier et second principes.",
    cartes: [
      ["Premier principe pour un système fermé", "$\\Delta U = W + Q$"],
      ["Loi des gaz parfaits", "$PV = nRT$ avec $R \\approx 8{,}314\\ \\mathrm{J\\,K^{-1}\\,mol^{-1}}$"],
      ["Relation de Mayer", "$C_p - C_v = nR$"],
      ["Second principe", "$\\Delta S = S_{\\text{éch}} + S_{\\text{créée}}$ avec $S_{\\text{créée}} \\geq 0$"],
    ],
  },
  {
    titre: "Atomistique", matiere: "Chimie", chapitre: "Structure de la matière",
    description: "Configuration électronique et classification.",
    cartes: [
      ["Règle de Klechkowski", "Les sous-couches se remplissent par $n+\\ell$ croissant, puis par $n$ croissant."],
      ["Configuration du carbone (Z=6)", "$1s^2\\,2s^2\\,2p^2$"],
      ["Principe d'exclusion de Pauli", "Deux électrons d'un même atome ne peuvent avoir leurs quatre nombres quantiques identiques."],
    ],
  },
  {
    titre: "Complexité algorithmique", matiere: "SI", chapitre: "Algorithmique",
    description: "Complexités à savoir citer sans hésiter.",
    cartes: [
      ["Complexité du tri fusion", "$O(n \\log n)$ dans tous les cas, mais $O(n)$ d'espace."],
      ["Complexité de la recherche dichotomique", "$O(\\log n)$"],
      ["Complexité du tri rapide au pire", "$O(n^2)$, atteinte sur un tableau déjà trié avec un mauvais pivot."],
      ["Complexité d'un parcours en largeur", "$O(|S| + |A|)$ pour un graphe à $|S|$ sommets et $|A|$ arêtes."],
    ],
  },
  {
    titre: "Vocabulaire — essai", matiere: "Anglais", chapitre: "Expression écrite",
    description: "Connecteurs et tournures pour l'essai de concours.",
    cartes: [
      ["« Néanmoins » en anglais soutenu", "*Nevertheless* / *Nonetheless*"],
      ["« Il convient de souligner que »", "*It is worth emphasising that…*"],
      ["« Dans une certaine mesure »", "*To some extent*"],
      ["« Contrairement à »", "*Unlike* (+ nom) / *Whereas* (+ proposition)"],
    ],
  },
];

const ECHEANCES: Array<[string, string, string | null, number]> = [
  ["DS de maths — chapitres 1 à 4", "DS", "Maths", 3],
  ["DM de physique à rendre", "DM", "Physique", 5],
  ["Colle de chimie", "Colle", "Chimie", 1],
  ["Oral blanc d'anglais", "Oral", "Anglais", 9],
  ["Rendu du TIPE — problématique", "TIPE", null, 16],
];

/** Petit PDF valide, pour que l'aperçu intégré ait de quoi s'afficher. */
function pdfMinimal(titre: string): Buffer {
  const contenu = `BT /F1 18 Tf 60 720 Td (${titre.replace(/[()\\]/g, "")}) Tj ET`;
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objets.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const debutXref = pdf.length;
  pdf += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${debutXref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

const DOCUMENTS: Array<[string, string, string, string[]]> = [
  ["Cours — Dérivation.pdf", "Maths", "Analyse — dérivation", ["cours", "chapitre 3"]],
  ["Corrigé DS2.pdf", "Maths", "Analyse — DL", ["corrigé", "ds"]],
  ["Fiche méthode — régime transitoire.pdf", "Physique", "Circuits — régime transitoire", ["méthode", "fiche"]],
  ["TP dosage — compte rendu.pdf", "Chimie", "Travaux pratiques", ["tp", "compte rendu"]],
  ["Résumé complexités.pdf", "SI", "Algorithmique", ["résumé", "révisions"]],
  ["Notes de colle — anglais.pdf", "Anglais", "Expression écrite", ["colle"]],
];

async function main() {
  const c = await pool.connect();
  try {
    if (reset) {
      await c.query(`truncate review_log, card_state, card_report, card_revision,
                              card, deck, card_image, document, echeance restart identity cascade`);
      console.log("Contenu du portail vidé.");
    }

    const membres = (await c.query<{ id: string; display_name: string }>(
      `select id, display_name from app_user order by created_at`)).rows;
    if (membres.length === 0) {
      throw new Error("Aucun compte : lancez d'abord scripts/seed.ts");
    }
    const admin = (await c.query<{ id: string }>(
      `select id from app_user where role = 'admin' limit 1`)).rows[0].id;
    console.log(`${membres.length} membres trouvés.`);

    /* --- Paquets et cartes ----------------------------------------- */
    const cartesParPaquet: Array<{ deckId: number; cardIds: number[] }> = [];

    for (const spec of PAQUETS) {
      const slug = `${spec.matiere}-${spec.titre}`.toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

      const existe = await c.query(`select id from deck where slug = $1`, [slug]);
      if (existe.rowCount) { console.log(`  ${slug} déjà présent`); continue; }

      const d = await c.query<{ id: number }>(
        `insert into deck (slug, titre, matiere, chapitre, description, created_by)
         values ($1,$2,$3::matiere,$4,$5,$6::uuid) returning id`,
        [slug, spec.titre, spec.matiere, spec.chapitre, spec.description, admin]);
      const deckId = d.rows[0].id;

      const cardIds: number[] = [];
      for (const [recto, verso] of spec.cartes) {
        // Auteur varié : les cartes viennent de toute la classe.
        const auteur = membres[entre(0, membres.length - 1)].id;
        const k = await c.query<{ id: number }>(
          `insert into card (deck_id, recto, verso, author_id) values ($1,$2,$3,$4::uuid)
           returning id`, [deckId, recto, verso, auteur]);
        cardIds.push(k.rows[0].id);
      }
      cartesParPaquet.push({ deckId, cardIds });
      console.log(`  ${slug} — ${cardIds.length} cartes`);
    }

    /* --- Historique de révision ------------------------------------ */
    // Une douzaine de membres révisent depuis trois semaines.
    const reviseurs = membres.slice(0, 14);
    let revisions = 0;

    for (const membre of reviseurs) {
      // Les deux tiers partagent leurs statistiques : la heatmap a de
      // quoi s'afficher sans être exhaustive.
      await c.query(`update app_user set partage_stats = $2 where id = $1::uuid`,
        [membre.id, alea() < 0.66]);

      for (const paquet of cartesParPaquet) {
        if (alea() < 0.35) continue;            // ce membre ignore ce paquet
        const combien = entre(2, paquet.cardIds.length);

        for (const cardId of paquet.cardIds.slice(0, combien)) {
          let carte = createEmptyCard(new Date(Date.now() - 21 * 86_400_000));
          let quand = new Date(Date.now() - entre(14, 21) * 86_400_000);
          const seances = entre(1, 4);

          for (let s = 0; s < seances; s++) {
            // Majorité de « Correct », comme une vraie série de révisions.
            const tirage = alea();
            const note = tirage < 0.12 ? Rating.Again
                       : tirage < 0.30 ? Rating.Hard
                       : tirage < 0.85 ? Rating.Good : Rating.Easy;

            const { card: suivante, log } = moteur.next(carte, quand, note);

            await c.query(
              `insert into review_log (user_id, card_id, rating, state, due, stability,
                                       difficulty, elapsed_days, last_elapsed_days,
                                       scheduled_days, reviewed_at, duree_ms)
               values ($1::uuid,$2,$3,$4::fsrs_state,$5,$6,$7,$8,$9,$10,$11,$12)`,
              [membre.id, cardId, note, ETATS[log.state], log.due, log.stability,
               log.difficulty, Math.max(0, Math.round(log.elapsed_days)),
               Math.max(0, Math.round(log.last_elapsed_days)),
               Math.max(0, Math.round(log.scheduled_days)), quand, entre(1500, 12000)]);
            revisions++;

            carte = suivante;
            quand = new Date(suivante.due.getTime());
            if (quand.getTime() > Date.now()) break;   // la suite est dans le futur
          }

          await c.query(
            `insert into card_state (user_id, card_id, state, due, stability, difficulty,
                                     elapsed_days, scheduled_days, learning_steps,
                                     reps, lapses, last_review)
             values ($1::uuid,$2,$3::fsrs_state,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             on conflict (user_id, card_id) do nothing`,
            [membre.id, cardId, ETATS[carte.state], carte.due, carte.stability,
             carte.difficulty, Math.max(0, Math.round(carte.elapsed_days)),
             Math.max(0, Math.round(carte.scheduled_days)), carte.learning_steps ?? 0,
             carte.reps, carte.lapses, carte.last_review ?? null]);
        }
      }
    }
    console.log(`${revisions} révisions simulées pour ${reviseurs.length} membres.`);

    /* --- Un signalement, pour que le circuit soit visible ------------ */
    if (cartesParPaquet.length > 0) {
      const cible = cartesParPaquet[0].cardIds[0];
      await c.query(
        `insert into card_report (card_id, reported_by, motif) values ($1,$2::uuid,$3)
         on conflict do nothing`,
        [cible, membres[3].id, "Le signe du résultat me paraît faux, à vérifier."]);
    }

    /* --- Documents -------------------------------------------------- */
    const dossier = join(RACINE, "documents");
    await mkdir(dossier, { recursive: true, mode: 0o700 });

    for (const [nom, matiere, chapitre, tags] of DOCUMENTS) {
      const existe = await c.query(`select id from document where original_name = $1`, [nom]);
      if (existe.rowCount) continue;

      const contenu = pdfMinimal(nom.replace(/\.pdf$/, ""));
      const stockage = randomBytes(16).toString("hex");
      await writeFile(join(dossier, stockage), contenu, { mode: 0o600 });

      await c.query(
        `insert into document (storage_name, original_name, mime, taille,
                               matiere, chapitre, tags, uploaded_by, created_at)
         values ($1,$2,'application/pdf',$3,$4::matiere,$5,$6,$7::uuid,
                 now() - ($8::int || ' days')::interval)`,
        [stockage, nom, contenu.length, matiere, chapitre, tags,
         membres[entre(0, membres.length - 1)].id, entre(0, 20)]);
    }
    console.log(`${DOCUMENTS.length} documents déposés.`);

    /* --- Échéances --------------------------------------------------- */
    for (const [titre, kind, matiere, jours] of ECHEANCES) {
      const existe = await c.query(`select id from echeance where titre = $1`, [titre]);
      if (existe.rowCount) continue;
      await c.query(
        `insert into echeance (titre, kind, matiere, due_at, created_by)
         values ($1,$2::echeance_kind,$3::matiere,
                 date_trunc('hour', now()) + ($4::int || ' days')::interval, $5::uuid)`,
        [titre, kind, matiere, jours, membres[entre(0, membres.length - 1)].id]);
    }
    console.log(`${ECHEANCES.length} échéances ajoutées.`);

    /* --- Contrôle ---------------------------------------------------- */
    const r = await c.query<{ decks: number; cards: number; etats: number; logs: number; docs: number }>(
      `select (select count(*) from deck)::int        as decks,
              (select count(*) from card)::int        as cards,
              (select count(*) from card_state)::int  as etats,
              (select count(*) from review_log)::int  as logs,
              (select count(*) from document)::int    as docs`);
    console.log("\n", r.rows[0]);

    const incoherents = await c.query(
      `select count(*)::int as n from card_state
        where (state = 'New') <> (last_review is null)`);
    if (incoherents.rows[0].n > 0) throw new Error("états FSRS incohérents");
    console.log("✓ états de révision cohérents\n");
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
