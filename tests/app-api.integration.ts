// API de l'app iOS (`/api/app/*`) de bout en bout, sur un schéma et un
// stockage jetables : aucune donnée de la classe n'est touchée.
//   NEXT_BUILD_DIR=.next-portal-check npm run build
//   node --env-file=.env --conditions=react-server --import tsx tests/app-api.integration.ts
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import pg from "pg";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const schema = `appapi_test_${process.pid}`;
const stockage = await mkdtemp("/tmp/mp2-appapi-");
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("options", `-c search_path=${schema} -c timezone=Europe/Paris`);
process.env.DATABASE_URL = url.toString();
process.env.STORAGE_ROOT = stockage;
process.env.PUBLIC_ORIGIN = "http://127.0.0.1:4265";
process.env.NEXT_BUILD_DIR = ".next-portal-check";
process.env.COURS_TOKEN = "jeton-cours-de-test-0123456789";
const { pool, query } = await import("../src/lib/db");
const { hashMotDePasse } = await import("../src/lib/session");

let serveur: ReturnType<typeof spawn> | undefined;
let logs = "";
let n = 0;
function ok(c: unknown, m: string) { assert.ok(c, m); n++; console.log(`PASS ${m}`); }

try {
  await admin.query(`create schema ${schema}`);
  for (const f of ["db/schema.sql", "db/functions.sql", "db/schema-portal.sql", "db/schema-proposals.sql",
                   "db/schema-etudes.sql", "db/schema-dossiers.sql", "db/schema-kcmaths.sql", "db/schema-toilet.sql", "db/schema-cours.sql"]) {
    await query(await readFile(f, "utf8"));
  }
  const hash = await hashMotDePasse("motdepasse-test");
  await query(`insert into app_user (email, display_name, password_hash, groupe_colle)
    values ('a@example.invalid','Test Alice',$1,3), ('b@example.invalid','Test Bob',$1,null)`, [hash]);

  serveur = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "4265", "-H", "127.0.0.1"],
    { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  serveur.stdout!.on("data", d => { logs += d; });
  serveur.stderr!.on("data", d => { logs += d; });
  const base = process.env.PUBLIC_ORIGIN!;
  let pret = false;
  for (let i = 0; i < 150 && !pret; i++) {
    try { pret = (await fetch(`${base}/connexion`)).ok; } catch {}
    if (!pret) await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(pret, logs);

  const appel = (methode: string, chemin: string, jeton?: string, corps?: unknown) => fetch(base + chemin, {
    method: methode,
    headers: { ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
               ...(corps === undefined ? {} : { "content-type": "application/json" }) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
    redirect: "manual",
  });
  const connexion = async (email: string, motDePasse: string) =>
    appel("POST", "/api/app/connexion", undefined, { email, motDePasse });

  // Connexion
  const mauvais = await connexion("a@example.invalid", "faux");
  const inconnu = await connexion("personne@example.invalid", "faux");
  ok(mauvais.status === 400 && inconnu.status === 400
     && (await mauvais.json()).erreur === (await inconnu.json()).erreur,
     "mauvais mot de passe et email inconnu : même réponse");
  const r = await connexion("A@example.invalid", "motdepasse-test");
  const session = await r.json();
  ok(r.status === 200 && typeof session.jeton === "string" && session.utilisateur.display_name === "Test Alice"
     && !("password_hash" in session.utilisateur), "connexion : jeton et profil, sans le hash");
  const alice = session.jeton as string;
  const bob = (await (await connexion("b@example.invalid", "motdepasse-test")).json()).jeton as string;
  ok(!r.headers.get("set-cookie"), "l'app reçoit un jeton, pas de cookie");

  // Inscription depuis l'app : code d'invitation, jeton direct.
  await query(`insert into invite_code (code, max_uses) values ('classe-test', 1)`);
  const inscrire = (champs: Record<string, string>) => appel("POST", "/api/app/inscription", undefined, champs);
  ok((await inscrire({ email: "c@example.invalid", pseudo: "Test Chloé", motDePasse: "motdepasse-test", code: "mauvais" })).status === 400,
     "inscription : code inconnu refusé");
  ok((await inscrire({ email: "c@example.invalid", pseudo: "C", motDePasse: "motdepasse-test", code: "classe-test" })).status === 400,
     "inscription : pseudo trop court refusé");
  ok((await inscrire({ email: "A@example.invalid", pseudo: "Test Chloé", motDePasse: "motdepasse-test", code: "classe-test" })).status === 400,
     "inscription : email déjà inscrit refusé");
  const nouvelle = await inscrire({ email: "c@example.invalid", pseudo: "Test Chloé", motDePasse: "motdepasse-test", code: "classe-test" });
  const chloe = await nouvelle.json();
  ok(nouvelle.status === 200 && typeof chloe.jeton === "string" && chloe.utilisateur.display_name === "Test Chloé",
     "inscription : compte créé, jeton renvoyé");
  ok((await appel("GET", "/api/app/accueil", chloe.jeton)).status === 200, "le jeton d'inscription ouvre l'app");
  ok((await inscrire({ email: "d@example.invalid", pseudo: "Test David", motDePasse: "motdepasse-test", code: "classe-test" })).status === 400,
     "inscription : code épuisé");

  // Authentification
  ok((await appel("GET", "/api/app/accueil")).status === 401, "sans jeton : 401");
  ok((await appel("GET", "/api/app/accueil", "x".repeat(43))).status === 401, "jeton inconnu : 401");
  const accueil = await (await appel("GET", "/api/app/accueil", alice)).json();
  ok(accueil.utilisateur.groupe_colle === 3 && Array.isArray(accueil.colles) && Array.isArray(accueil.matieres)
     && typeof accueil.fiches.a_reviser === "number", "accueil complet pour Alice");
  ok((await appel("GET", "/", alice)).status === 200, "le jeton porteur ouvre aussi les pages du site");

  // Colles
  const colles = await (await appel("GET", "/api/app/colles?semaine=2026-11-12", alice)).json();
  ok(colles.groupe === 3 && colles.lundi === "2026-11-09" && Array.isArray(colles.semaine.colles),
     "colles : semaine ramenée au lundi");
  const sansGroupe = await (await appel("GET", "/api/app/colles", bob)).json();
  ok(sansGroupe.groupe === null && sansGroupe.semaine === null, "colles sans groupe : demande de groupe");
  ok((await appel("PUT", "/api/app/groupe", bob, { groupe: 9999 })).status === 400, "groupe invalide refusé");
  ok((await appel("PUT", "/api/app/groupe", bob, { groupe: 2 })).status === 200
     && (await (await appel("GET", "/api/app/colles", bob)).json()).groupe === 2, "groupe enregistré");

  // Échéances : tout membre corrige, seul l'auteur (ou un admin) supprime.
  const demain = new Date(Date.now() + 86_400_000).toISOString();
  ok((await appel("POST", "/api/app/echeances", alice, { titre: "x", dueAt: demain })).status === 400,
     "échéance au titre trop court refusée");
  ok((await appel("POST", "/api/app/echeances", alice, { titre: "DS de maths", matiere: "", dueAt: demain })).status === 200,
     "échéance créée");
  const [{ id }] = await query<{ id: number }>("select id from echeance where titre = 'DS de maths'");
  ok((await appel("PATCH", `/api/app/echeances/${id}`, bob, { titre: "DS de maths (ch. 5)", matiere: "", dueAt: demain })).status === 200,
     "un autre membre corrige l'échéance");
  ok((await appel("DELETE", `/api/app/echeances/${id}`, bob)).status === 403, "Bob ne peut pas la supprimer : 403");
  ok((await appel("DELETE", "/api/app/echeances/abc", alice)).status === 404, "identifiant invalide : 404");
  ok((await appel("DELETE", `/api/app/echeances/${id}`, alice)).status === 200
     && (await (await appel("GET", "/api/app/accueil", alice)).json()).echeances.length === 0,
     "Alice la supprime");

  // Documents : envoi par la route existante avec le jeton, puis liste et corbeille.
  const form = new FormData();
  form.set("fichier", new File([Buffer.from("%PDF-1.4\n%test\n")], "cours.pdf", { type: "application/pdf" }));
  const envoi = await fetch(`${base}/api/documents/upload`, {
    method: "POST", headers: { authorization: `Bearer ${alice}` }, body: form });
  ok(envoi.status === 200, `envoi de document avec le jeton (${envoi.status})`);
  const docs = await (await appel("GET", "/api/app/documents", bob)).json();
  const doc = docs.documents.find((d: { original_name: string }) => d.original_name === "cours.pdf");
  ok(doc && doc.peut_supprimer === false && !("storage_name" in doc) && docs.usage.quota_membre > 0,
     "liste : droits calculés, nom sur disque jamais exposé");
  ok((await appel("GET", "/api/app/documents?q=cours", bob).then(r => r.json())).documents.length === 1, "recherche");
  const telechargement = await appel("GET", `/api/documents/${doc.id}`, bob);
  ok(telechargement.status === 200 && (await telechargement.text()).startsWith("%PDF"), "téléchargement avec le jeton");
  ok((await appel("DELETE", `/api/app/documents/${doc.id}`, bob)).status === 403, "Bob ne supprime pas le document d'Alice : 403");
  ok((await appel("DELETE", `/api/app/documents/${doc.id}`, alice)).status === 200, "Alice le met à la corbeille");

  // Fiches : suivre, réviser (le serveur planifie), préchargement exact.
  const [{ id: aliceId }] = await query<{ id: string }>("select id from app_user where email='a@example.invalid'");
  const [deck] = await query<{ id: number }>(`insert into deck(slug,titre,matiere,chapitre,created_by)
    values ('app-api','Paquet app','Maths','Analyse',$1) returning id`, [aliceId]);
  const cartes = await query<{ id: number }>(`insert into card(deck_id,recto,verso,author_id)
    values ($1,'Dérivée de $x^2$','$2x$',$2), ($1,'{{c1::Cauchy}} et {{c2::Lipschitz}}','théorème',$2) returning id`,
    [deck.id, aliceId]);
  const liste = await (await appel("GET", "/api/app/fiches", bob)).json();
  ok(liste.paquets.some((p: { id: number; abonne: boolean }) => p.id === deck.id && !p.abonne), "fiches : paquet listé, non suivi");
  const sansSuivi = await (await appel("POST", "/api/app/revision/suivante", bob, { paquet: deck.id, exclure: [] })).json();
  ok(sansSuivi.carte === null, "paquet non suivi : aucune carte à réviser");
  const suivi = await (await appel("PATCH", `/api/app/fiches/${deck.id}`, bob, { suivre: true, aime: true })).json();
  ok(suivi.abonne === true && suivi.likes === 1 && suivi.aime === true, "suivre et aimer en un appel");
  const premiere = (await (await appel("POST", "/api/app/revision/suivante", bob, { paquet: deck.id, exclure: [] })).json()).carte;
  ok(premiere && premiere.rectoHtml.includes("katex") && premiere.apercu.length === 4 && premiere.restant.nouvelles === 2,
     "carte composée côté serveur (KaTeX, quatre intervalles, compteurs)");
  const prechargee = (await (await appel("POST", "/api/app/revision/suivante", bob,
    { paquet: deck.id, exclure: [premiere.cardId] })).json()).carte;
  const note = await appel("POST", "/api/app/revision", bob, { carte: premiere.cardId, note: "good", jeton: premiere.jeton, dureeMs: 1200 });
  ok(note.status === 200 && typeof (await note.json()).intervalle === "string", "révision enregistrée");
  const apres = (await (await appel("POST", "/api/app/revision/suivante", bob, { paquet: deck.id, exclure: [] })).json()).carte;
  ok(apres && prechargee && apres.cardId === prechargee.cardId, "la carte préchargée est bien celle que le serveur renvoie ensuite");
  ok(apres.trousHtml.length === 2, "texte à trous : un HTML par trou");
  const rejouee = await appel("POST", "/api/app/revision", bob, { carte: premiere.cardId, note: "easy", jeton: premiere.jeton });
  ok(rejouee.status === 400, "un jeton de révision ne sert qu'une fois");
  ok((await appel("POST", "/api/app/revision", alice, { carte: cartes[1].id, note: "good", jeton: apres.jeton })).status === 400,
     "le jeton de Bob ne vaut rien pour Alice");

  // Édition des fiches : créer un paquet, ajouter, corriger, signaler, supprimer.
  ok((await appel("POST", "/api/app/fiches", bob, { titre: "x" })).status === 400, "titre de paquet trop court refusé");
  const cree = await (await appel("POST", "/api/app/fiches", bob, { titre: "Paquet de Bob", matiere: "" })).json();
  ok(typeof cree.id === "number" && cree.slug === "paquet-de-bob", "paquet créé (slug)");
  ok((await appel("POST", `/api/app/fiches/${cree.id}/cartes`, bob, { recto: " ", verso: "a" })).status === 400, "carte vide refusée");
  ok((await appel("POST", "/api/app/fiches/999999/cartes", bob, { recto: "a", verso: "b" })).status === 400, "carte dans un paquet inconnu refusée");
  const carte = await (await appel("POST", `/api/app/fiches/${cree.id}/cartes`, bob, { recto: "Intégrale de $1/x$", verso: "$\\ln|x|$" })).json();
  ok(typeof carte.cardId === "number", "carte ajoutée");
  const fiche = await (await appel("GET", `/api/app/fiches/${cree.id}`, bob)).json();
  ok(fiche.paquet.abonne === true && fiche.peutModifier === true && fiche.stats !== null && fiche.cartes.length === 1
     && fiche.cartes[0].rectoHtml.includes("katex") && fiche.cartes[0].peutSupprimer === true && !("author_id" in fiche.cartes[0]),
     "fiche : créateur abonné, cartes composées, droits");
  const vueAlice = await (await appel("GET", `/api/app/fiches/${cree.id}`, alice)).json();
  ok(vueAlice.peutModifier === false && vueAlice.stats === null && vueAlice.cartes[0].peutSupprimer === false,
     "pour Alice : ni modification du paquet ni suppression");
  ok((await appel("PATCH", `/api/app/fiches/${cree.id}`, alice, { titre: "Piraté" })).status === 403, "Alice ne renomme pas le paquet : 403");
  ok((await appel("PATCH", `/api/app/fiches/${cree.id}`, bob, { titre: "Paquet de Bob (v2)", description: "Primitives" })).status === 200,
     "Bob renomme son paquet");
  ok((await appel("PATCH", `/api/app/cartes/${carte.cardId}`, alice, { recto: "Primitive de $1/x$", verso: "$\\ln|x|$", motif: "Vocabulaire" })).status === 200,
     "Alice corrige la carte de Bob");
  const histo = await (await appel("GET", `/api/app/cartes/${carte.cardId}/historique`, bob)).json();
  ok(histo.versions.length === 2 && histo.versions[0].auteur === "Test Alice" && histo.versions[0].motif === "Vocabulaire",
     "historique : la correction est attribuée");
  ok((await appel("POST", `/api/app/cartes/${carte.cardId}/signalement`, alice, { motif: "x" })).status === 400, "motif trop court");
  ok((await appel("POST", `/api/app/cartes/${carte.cardId}/signalement`, alice, { motif: "Il manque la constante" })).status === 200
     && (await appel("POST", `/api/app/cartes/${carte.cardId}/signalement`, alice, { motif: "Encore" })).status === 200,
     "signalement (une seule fois par membre, sans erreur)");
  ok((await appel("POST", "/api/app/cartes/999999/signalement", alice, { motif: "Introuvable" })).status === 400, "signaler une carte inconnue");
  const ap = await (await appel("POST", "/api/app/apercu", bob, { recto: "$e^{i\\pi}$", verso: "(vide)" })).json();
  ok(ap.recto.includes("katex") && ap.verso === "", "aperçu composé par le serveur");
  ok((await appel("DELETE", `/api/app/cartes/${carte.cardId}`, alice)).status === 403, "Alice ne supprime pas la carte de Bob : 403");
  ok((await appel("DELETE", `/api/app/cartes/${carte.cardId}`, bob)).status === 200
     && (await (await appel("GET", `/api/app/fiches/${cree.id}`, bob)).json()).cartes.length === 0, "Bob supprime sa carte");

  // Vidéos : fil, j'aime, vue unique, commentaires et droits de suppression.
  const [video] = await query<{ id: number }>(`insert into video(auteur,titre,statut,montage,duree_ms)
    values ($1,'Les séries','pret','{}'::jsonb,30000) returning id`, [aliceId]);
  await query(`insert into video(auteur,titre,statut,montage) values ($1,'En montage','traitement','{}'::jsonb)`, [aliceId]);
  const fil = await (await appel("GET", "/api/app/videos", bob)).json();
  ok(fil.videos.length === 1 && fil.videos[0].id === video.id && fil.profil === null, "fil : seules les vidéos prêtes");
  const moi = await (await appel("GET", "/api/app/videos?auteur=moi", alice)).json();
  ok(moi.profil?.pseudo === "Test Alice" && moi.videos.length === 1, "profil « moi »");
  const like = await (await appel("PATCH", `/api/app/videos/${video.id}`, bob, { aime: true, vue: true })).json();
  await appel("PATCH", `/api/app/videos/${video.id}`, bob, { vue: true });
  const [{ vues }] = await query<{ vues: number }>("select count(*)::int as vues from video_vue where video_id=$1", [video.id]);
  ok(like.likes === 1 && like.aime === true && vues === 1, "j'aime et une seule vue par membre");
  ok((await appel("POST", `/api/app/videos/${video.id}/commentaires`, bob, { texte: " " })).status === 400, "commentaire vide refusé");
  const com = await (await appel("POST", `/api/app/videos/${video.id}/commentaires`, bob, { texte: "Super clair !" })).json();
  ok(com.commentaires.length === 1 && com.commentaires[0].auteur === "Test Bob", "commentaire publié");
  ok((await appel("DELETE", `/api/app/commentaires/${com.commentaires[0].id}`, alice)).status === 200,
     "l'auteure de la vidéo peut retirer un commentaire");

  // Toilet! : invisible hors membres ; passage par la route du site avec le jeton.
  ok((await (await appel("GET", "/api/app/accueil", bob)).json()).utilisateur.toilet === false, "accueil : Toilet! cachée");
  ok((await appel("GET", "/api/app/toilet", bob)).status === 404, "Toilet! : 404 hors membres");
  await query(`insert into toilet_membre (user_id) select id from app_user where email = 'b@example.invalid'`);
  ok((await (await appel("GET", "/api/app/accueil", bob)).json()).utilisateur.toilet === true, "accueil : Toilet! visible pour un membre");
  const passage = await fetch(`${base}/api/toilet/passage`, { method: "POST", headers: { authorization: `Bearer ${bob}` }, body: new FormData() });
  ok(passage.status === 200, `passage enregistré avec le jeton (${passage.status})`);
  const toilet = await (await appel("GET", "/api/app/toilet?periode=mois", bob)).json();
  ok(toilet.periode === "mois" && toilet.stats.total === 1 && toilet.statut.titre === "Premier jet"
     && toilet.classement[0].moi === true && toilet.classement[0].n === 1 && !("user_id" in toilet.classement[0])
     && toilet.fil[0].peutSupprimer === true && toilet.aProuver.length === 1,
     "Toilet! : statut, classement, fil et passage à prouver");
  ok((await appel("DELETE", `/api/app/toilet/passages/${toilet.fil[0].id}`, alice)).status === 403, "Alice ne retire pas le passage de Bob");
  ok((await appel("DELETE", `/api/app/toilet/passages/${toilet.fil[0].id}`, bob)).status === 200
     && (await (await appel("GET", "/api/app/toilet", bob)).json()).stats.total === 0, "Bob retire son passage");

  // Profil : portefeuille, réglages, retours et propositions.
  const profil = await (await appel("GET", "/api/app/profil", bob)).json();
  ok(typeof profil.portefeuille.solde === "number" && profil.partageStats === false && profil.groupeMax > 0
     && Array.isArray(profil.releve) && Array.isArray(profil.positions.ouvertes), "profil complet");
  ok((await appel("PATCH", "/api/app/profil", bob, { partageStats: "oui" })).status === 400, "partage : booléen exigé");
  ok((await appel("PATCH", "/api/app/profil", bob, { partageStats: true })).status === 200
     && (await (await appel("GET", "/api/app/profil", bob)).json()).partageStats === true, "partage des stats activé");
  ok((await appel("POST", "/api/app/retours", bob, { categorie: "bug", message: "ko" })).status === 400, "retour trop court refusé");
  ok((await appel("POST", "/api/app/retours", bob, { categorie: "idee", message: "Un mode sombre pour les fiches" })).status === 200
     && (await (await appel("GET", "/api/app/profil", bob)).json()).retours[0].statut === "ouvert", "retour envoyé et suivi");
  const hier = new Date(Date.now() - 86_400_000).toISOString();
  const passe = await appel("POST", "/api/app/propositions", bob, { question: "Qui finira le DM ?", description: "Au vu des copies", closesAt: hier, issues: ["Moi", "Toi"] });
  ok(passe.status === 400 && (await passe.json()).erreur.includes("futur"), "proposition : date passée refusée avec un message clair");
  ok((await appel("POST", "/api/app/propositions", bob, { question: "Qui finira le DM ?", description: "Au vu des copies", closesAt: demain, issues: ["Moi", "Toi"] })).status === 200
     && (await (await appel("GET", "/api/app/profil", bob)).json()).propositions[0].status === "pending", "proposition envoyée");
  ok((await appel("POST", "/api/app/portefeuille", bob, { sens: "depot", montant: "5", cle: "pas-un-uuid" })).status === 400, "transfert : clé invalide refusée");
  const kc = await appel("POST", "/api/app/portefeuille", bob, { sens: "depot", montant: "5", cle: crypto.randomUUID() });
  ok(kc.status === 400 && (await kc.json()).erreur.includes("indisponibles"), "transfert : kcmaths non configuré, refus propre");

  // Cours : seule la source munie de COURS_TOKEN publie ; les membres lisent et cherchent.
  const publier = (corps: unknown, jeton = process.env.COURS_TOKEN!) => fetch(`${base}/api/cours/publier`, {
    method: "POST", headers: { authorization: `Bearer ${jeton}`, "content-type": "application/json" },
    body: JSON.stringify(corps) });
  ok((await publier({ action: "chapitre", cle: "x", titre: "x" }, "mauvais")).status === 401, "publication : mauvais jeton refusé");
  ok((await publier({ action: "chapitre", cle: "x", titre: "x" }, alice)).status === 401, "un jeton de membre ne publie pas");
  ok((await publier({ action: "chapitre", cle: "Pas Bon", titre: "x" })).status === 400, "clé de chapitre validée");
  ok((await publier({ action: "chapitre", cle: "maths-ch6", titre: "Complexes", matiere: "Inexistante" })).status === 400,
     "matière inconnue refusée");
  ok((await publier({ action: "chapitre", cle: "maths-ch6", titre: "Complexes", numero: 6 })).status === 200, "chapitre publié");
  const envoyerPdf = async (texte: string) => {
    const form = new FormData();
    form.set("meta", JSON.stringify({ chapitre: "maths-ch6", cle: "cours", genre: "cours", titre: "Cours complet" }));
    form.set("pages", JSON.stringify([`Les nombres complexes forment un corps commutatif. ${texte}`,
                                      "La forme exponentielle et le module d'un produit."]));
    form.set("fichier", new File([Buffer.from(`%PDF-1.4\n%${texte}\n`)], "c.pdf", { type: "application/pdf" }));
    return fetch(`${base}/api/cours/publier`, { method: "POST", headers: { authorization: `Bearer ${process.env.COURS_TOKEN}` }, body: form });
  };
  ok((await envoyerPdf("v1")).status === 200, "PDF publié avec ses pages");
  ok((await envoyerPdf("v2")).status === 200 && (await readdir(`${stockage}/cours`)).length === 1,
     "republier remplace le fichier et efface l'ancien du disque");
  ok((await publier({ action: "paquets", chapitre: "maths-ch6", slugs: ["app-api", "inexistant"] })).status === 400,
     "paquet inconnu refusé");
  ok((await publier({ action: "paquets", chapitre: "maths-ch6", slugs: ["app-api"] })).status === 200, "paquet proposé lié");
  const cours = await (await appel("GET", "/api/app/cours", bob)).json();
  const ch = cours.chapitres[0];
  ok(ch?.cle === "maths-ch6" && ch.fichiers.length === 1 && !("storage_name" in ch.fichiers[0])
     && ch.paquets[0]?.slug === "app-api" && ch.paquets[0].abonne === true,
     "catalogue membre : PDF sans nom disque, paquet avec l'état de Bob");
  const rech = await (await appel("GET", `/api/app/cours/recherche?q=${encodeURIComponent("exponentielles")}`, bob)).json();
  ok(rech.resultats.length === 1 && rech.resultats[0].page === 2 && rech.resultats[0].extrait.includes(rech.debut),
     "assistant : la bonne page, mot surligné, pluriel compris");
  ok((await (await appel("GET", "/api/app/cours/recherche?q=corps%20commutatif", bob)).json()).resultats[0]?.page === 1,
     "assistant : expression sur la page 1");
  const pdf = await appel("GET", `/api/cours/fichier/${ch.fichiers[0].id}`, bob);
  ok(pdf.status === 200 && (await pdf.text()).includes("v2"), "le membre lit la dernière version du PDF");
  ok((await appel("GET", `/api/cours/fichier/${ch.fichiers[0].id}`)).status === 401, "PDF de cours : session obligatoire");
  ok((await publier({ action: "retirer-chapitre", cle: "maths-ch6" })).status === 200
     && (await readdir(`${stockage}/cours`)).length === 0
     && (await (await appel("GET", "/api/app/cours", bob)).json()).chapitres.length === 0,
     "retirer un chapitre efface ses fichiers");

  // Notifications : l'iPhone est un appareil du membre, avec les mêmes réglages que le site.
  const jetonApns = "ab".repeat(32);
  ok((await appel("PUT", "/api/app/notifications/appareil", bob, { jeton: "zz", environnement: "sandbox" })).status === 400,
     "jeton APNs invalide refusé");
  ok((await appel("PUT", "/api/app/notifications/appareil", bob, { jeton: jetonApns, environnement: "sandbox" })).status === 200
     && (await (await appel("GET", "/api/app/notifications", bob)).json()).appareils === 1, "iPhone enregistré et compté");
  ok((await appel("PUT", "/api/app/notifications/appareil", alice, { jeton: jetonApns, environnement: "production" })).status === 200
     && (await (await appel("GET", "/api/app/notifications", bob)).json()).appareils === 0,
     "un téléphone repris par un autre compte change de propriétaire");
  const prefs = await (await appel("PATCH", "/api/app/notifications", alice, { flash: true, flash_heure: 20 })).json();
  ok(prefs.flash === true && prefs.flash_heure === 20 && prefs.devoirs === true, "réglages : seuls les champs donnés changent");
  ok((await (await appel("PATCH", "/api/app/notifications", alice, { flash_heure: 3 })).json()).flash_heure === 20,
     "heure hors bornes ignorée");
  ok((await (await appel("POST", "/api/app/notifications/test", alice)).json()).appareils === 0,
     "sans clé APNs configurée, rien ne part (et rien ne casse)");
  ok((await appel("DELETE", "/api/app/notifications/appareil", alice, { jeton: jetonApns })).status === 200
     && (await (await appel("GET", "/api/app/notifications", alice)).json()).appareils === 0, "iPhone retiré à la déconnexion");

  // Marché : tout l'argent passe par place_bet ; l'app n'envoie qu'une saisie et une clé d'idempotence.
  const [{ id: bobId }] = await query<{ id: string }>("select id from app_user where email='b@example.invalid'");
  // Un marché a au moins deux issues (contrôle différé au commit) : une seule instruction.
  const issues = await query<{ id: number }>(`with m as (
      insert into market (slug, question, closes_at, created_by)
      values ('ds-maths', 'Le DS de maths sera-t-il rendu vendredi ?', now() + interval '2 days', $1) returning id)
    insert into outcome (market_id, label, position)
    select m.id, x.label, x.position from m, (values ('Oui', 0), ('Non', 1)) as x(label, position)
    order by x.position returning id`, [aliceId]);
  await query("select record_deposit($1::uuid, 500, 'test-depot-bob')", [bobId]);
  const accueilMarche = await (await appel("GET", "/api/app/marche", bob)).json();
  ok(accueilMarche.solde === 500 && accueilMarche.marches.length === 1 && accueilMarche.marches[0].issues.length === 2,
     "marché : solde et marché ouvert");
  const cle = "3f1c2a4e-9b7d-4c1a-8e2f-0a1b2c3d4e5f";
  const pari = await (await appel("POST", "/api/app/marche/pari", bob, { issue: issues[0].id, montant: "1,50", cle })).json();
  ok(pari.miseCentimes === 150 && pari.soldeCentimes === 350, "mise de 1,50 PCK, solde autoritatif renvoyé");
  const rejoue = await (await appel("POST", "/api/app/marche/pari", bob, { issue: issues[0].id, montant: "1,50", cle })).json();
  const [{ n: nbParis }] = await query<{ n: number }>("select count(*)::int as n from bet where user_id = $1", [bobId]);
  ok(rejoue.soldeCentimes === 350 && nbParis === 1, "requête rejouée : un seul pari, aucun double débit");
  const refus = async (montant: string, c = crypto.randomUUID()) =>
    (await appel("POST", "/api/app/marche/pari", bob, { issue: issues[1].id, montant, cle: c })).status;
  const codes = [await refus("0,05"), await refus("abc"), await refus("10"), await refus("1", "pas-un-uuid")];
  ok(codes.every((c) => c === 400), `minimum, saisie invalide, solde insuffisant et clé invalide refusés (${codes})`);
  const detail = await (await appel("GET", "/api/app/marche/ds-maths", bob)).json();
  ok(detail.marche.cagnotte === 150 && detail.marche.issues[0].ma_mise === 150 && detail.solde === 350,
     "détail : cagnotte, ma mise et solde à jour");
  ok((await appel("GET", "/api/app/marche/inconnu", bob)).status === 400, "marché inconnu refusé");
  const cl = await (await appel("GET", "/api/app/marche/classement", bob)).json();
  ok(cl.classement.some((l: { display_name: string }) => l.display_name === "Test Bob")
     && !("solde" in cl.classement[0]) && cl.mouvements.length >= 2,
     "classement sans le solde des autres, relevé du portefeuille");

  // Déconnexion : le jeton est révoqué.
  ok((await appel("POST", "/api/app/deconnexion", alice)).status === 200
     && (await appel("GET", "/api/app/accueil", alice)).status === 401, "déconnexion : jeton révoqué");

  console.log(`\n${n} vérifications OK`);
} finally {
  serveur?.kill();
  await pool.end();
  await admin.query(`drop schema if exists ${schema} cascade`);
  await admin.end();
  await rm(stockage, { recursive: true, force: true });
}
