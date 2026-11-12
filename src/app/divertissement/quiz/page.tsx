import Link from "next/link";
import { redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { PastilleMatiere, styleMatiere } from "@/components/Matiere";
import { listerMatieres } from "@/lib/matieres";
import { listerQuiz, maReussiteParMatiere } from "@/lib/quiz";
import { pourcent } from "@/lib/quiz-commun";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quiz — MP2I/FSM" };

/*
 * Quiz : QCM écrits par la classe. Filtre par matière (?matiere=), ma
 * réussite par matière (premières tentatives), puis la liste des quiz.
 */
export default async function PageQuiz({ searchParams }: { searchParams: Promise<{ matiere?: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const { matiere } = await searchParams;
  const filtre = matiere && /^\d+$/.test(matiere) ? Number(matiere) : null;

  const [quiz, matieres, reussite] = await Promise.all([
    listerQuiz(u.id, filtre), listerMatieres(), maReussiteParMatiere(u.id),
  ]);

  return (
    <main>
      <LienRetour href="/divertissement" label="Retour au divertissement" />
      <header className="page-heading">
        <h1>Quiz</h1>
        <Link href="/divertissement/quiz/nouveau" className="puce">+ Créer un quiz</Link>
        <p>Des QCM écrits par la classe, sur le cours et les colles. Réponds, puis compare-toi aux autres.</p>
      </header>

      {reussite.length > 0 && (
        <section className="mb-10">
          <h2 className="etiquette">Ma réussite (premiers essais)</h2>
          <ul className="space-y-3">
            {reussite.map((r) => {
              const p = pourcent(r.justes, r.repondues) ?? 0;
              return (
                <li key={r.matiere ?? "-"} style={styleMatiere(r.couleur)}>
                  <div className="flex items-baseline justify-between gap-3 text-[14px]">
                    <PastilleMatiere nom={r.matiere} couleur={r.couleur} />
                    <span className="tabular text-[var(--muted-foreground)]">
                      {r.justes}/{r.repondues} · <strong className="text-[var(--foreground)]">{p} %</strong>
                    </span>
                  </div>
                  <div className="barre mt-1.5"><span style={{ width: `${p}%`, background: "var(--m)" }} /></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {matieres.length > 0 && (
        <nav aria-label="Filtrer par matière" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          <Link href="/divertissement/quiz" className="puce" aria-current={filtre === null ? "page" : undefined}>Tous</Link>
          {matieres.map((m) => (
            <Link key={m.id} href={`/divertissement/quiz?matiere=${m.id}`} className="puce"
                  aria-current={filtre === m.id ? "page" : undefined}>
              {m.nom}
            </Link>
          ))}
        </nav>
      )}

      {quiz.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-[var(--muted-foreground)]">
          Aucun quiz {filtre !== null ? "dans cette matière " : ""}pour l’instant.{" "}
          <Link href="/divertissement/quiz/nouveau">Écris le premier</Link>.
        </p>
      ) : (
        <ul>
          {quiz.map((q) => (
            <li key={q.id}>
              <Link href={`/divertissement/quiz/${q.id}`} className="ligne">
                <span className="min-w-0 flex-1">
                  <span className="ligne__titre block truncate">{q.titre}</span>
                  <span className="ligne__meta mt-1 flex flex-wrap items-center gap-x-2">
                    <PastilleMatiere nom={q.matiere} couleur={q.couleur} petite />
                    <span>· {q.nb_questions} question{q.nb_questions > 1 ? "s" : ""}</span>
                    <span>· {q.participants} participant{q.participants > 1 ? "s" : ""}</span>
                    <span>· par {q.auteur}</span>
                  </span>
                </span>
                <Statut q={q} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Statut({ q }: { q: { en_cours: boolean; mon_score: number | null } }) {
  if (q.mon_score !== null) {
    return <span className="tabular shrink-0 text-[15px] font-semibold">{q.mon_score} %</span>;
  }
  if (q.en_cours) return <span className="shrink-0 text-[13px] text-[var(--muted-foreground)]">En cours</span>;
  return <span className="pastille-compte shrink-0">Nouveau</span>;
}
