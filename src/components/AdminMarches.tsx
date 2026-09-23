"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { annulerMarche, creerMarche, resoudreMarche } from "@/lib/actions";
import { proposerPari } from "@/lib/actions-admin";
import { couleurIssue } from "./couleurs";
import { cotesImplicites, formatCentimes, formatPourcentage, tempsRestant } from "@/lib/money";
import type { MarcheVue } from "@/lib/queries";

/* Creation d'un marche. Deux issues par defaut (binaire) ; on peut en
 * ajouter jusqu'a dix pour un marche a choix multiple. */
export function FormulaireMarche({ proposition = false }: { proposition?: boolean }) {
  const router = useRouter();
  const [issues, setIssues] = useState(["Oui", "Non"]);
  const [message, setMessage] = useState<{ ton: "ok" | "ko"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const [ouvert, setOuvert] = useState(false);

  function envoyer(formData: FormData) {
    setMessage(null);
    demarrer(async () => {
      const date = new Date(String(formData.get("closesAt")));
      if (Number.isNaN(date.getTime())) { setMessage({ ton: "ko", texte: "Date invalide" }); return; }
      formData.set("closesAt", date.toISOString());
      const r = proposition ? await proposerPari({ question: formData.get("question"), description: formData.get("description"), closesAt: date.toISOString(), issues: formData.getAll("issue") }) : await creerMarche(formData);
      if (r.ok) {
        setMessage({ ton: "ok", texte: proposition ? "Proposition envoyée ! Retrouvez son statut dans votre profil." : "Marché créé" });
        setIssues(["Oui", "Non"]);
        setOuvert(false);
        router.refresh();
      } else {
        setMessage({ ton: "ko", texte: r.erreur });
      }
    });
  }

  if (!ouvert) {
    return (
      <div><button
        type="button"
        onClick={() => setOuvert(true)}
        className="w-full rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3
                   text-[14px] font-semibold text-[var(--primary-foreground)]"
      >
        {proposition ? "+ Proposer un pari" : "+ Nouveau marché"}
      </button>{message && <p role="status" className="mt-2 text-sm">{message.texte}</p>}</div>
    );
  }

  return (
    <form action={envoyer} className="app-surface rounded-[var(--radius-lg)] border p-4 lg:p-5">
      <h2 className="text-[15px] font-semibold">{proposition ? "Proposer un pari" : "Nouveau marché"}</h2>
      {proposition && <p className="mt-1 text-sm text-[var(--muted-foreground)]">Une idée amusante pour la classe ? Un administrateur la validera avant son ouverture.</p>}

      <label htmlFor="question" className="mt-3 block text-[13px] font-medium">Question</label>
      <input
        id="question" name="question" required minLength={8} maxLength={200}
        placeholder="Y aura-t-il un DS de maths avant les vacances ?"
        className="mt-1 w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                   outline-none focus:border-[var(--ring)]"
      />

      <label htmlFor="description" className="mt-3 block text-[13px] font-medium">
        Précisions (règle de résolution)
      </label>
      <textarea
        id="description" name="description" required={proposition} rows={2} maxLength={1000}
        placeholder="Comment la question sera tranchée, sans ambiguïté."
        className="mt-1 w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                   outline-none focus:border-[var(--ring)]"
      />

      <label htmlFor="closesAt" className="mt-3 block text-[13px] font-medium">
        Fermeture des paris
      </label>
      <input
        id="closesAt" name="closesAt" type="datetime-local" required
        className="mt-1 w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                   outline-none focus:border-[var(--ring)]"
      />

      <fieldset className="mt-3">
        <legend className="text-[13px] font-medium">Issues</legend>
        <div className="mt-1 space-y-2">
          {issues.map((valeur, i) => (
            <div key={i} className="flex gap-2">
              <span className="mt-3 h-3 w-3 shrink-0 rounded-[4px]"
                    style={{ background: couleurIssue(i) }} aria-hidden />
              <input
                name="issue" required maxLength={60} value={valeur}
                aria-label={`Issue ${i + 1}`}
                onChange={(e) =>
                  setIssues((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
                className="min-w-0 flex-1 rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                           outline-none focus:border-[var(--ring)]"
              />
              {issues.length > 2 && (
                <button
                  type="button"
                  onClick={() => setIssues((p) => p.filter((_, j) => j !== i))}
                  aria-label={`Supprimer l’issue ${i + 1}`}
                  className="rounded-[var(--radius-md)] border px-3 text-[13px]"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {issues.length < 10 && (
          <button
            type="button"
            onClick={() => setIssues((p) => [...p, ""])}
            className="mt-2 text-[13px] font-medium text-[var(--primary)]"
          >
            + Ajouter une issue
          </button>
        )}
      </fieldset>

      {message && (
        <p role="alert" className={`mt-3 text-[13px] font-medium ${
          message.ton === "ok" ? "text-[var(--outcome-1)]" : "text-[var(--destructive)]"
        }`}>
          {message.texte}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="rounded-[var(--radius-md)] border px-4 py-2.5 text-[14px] font-medium"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={enCours}
          className="min-w-0 flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2.5
                     text-[14px] font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
        >
          {enCours ? "…" : proposition ? "Envoyer pour validation" : "Créer le marché"}
        </button>
      </div>
    </form>
  );
}

/* Resolution manuelle. Le paiement se fait entierement dans
 * settle_market() cote PostgreSQL ; ce bouton ne fait que l'appeler. */
export function CarteResolution({ marche }: { marche: MarcheVue }) {
  const router = useRouter();
  const [choix, setChoix] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const issues = marche.issues ?? [];
  const parts = cotesImplicites(issues.map((i) => i.mises));
  const regle = marche.status === "resolved" || marche.status === "cancelled";

  function resoudre() {
    if (choix === null) return;
    const issue = issues.find((i) => i.id === choix);
    if (!confirm(
      `Résoudre « ${marche.question} » sur l’issue « ${issue?.label}` +
      ` » ?\n\nLa cagnotte de ${formatCentimes(marche.cagnotte)} sera versée` +
      ` immédiatement. Cette action est irréversible.`
    )) return;

    setMessage(null);
    demarrer(async () => {
      const r = await resoudreMarche(marche.id, choix);
      setMessage(r.ok ? `Cagnotte versée : ${formatCentimes(r.data.cagnotte)}` : r.erreur);
      if (r.ok) router.refresh();
    });
  }

  function annuler() {
    if (!confirm(
      `Annuler « ${marche.question} » ?\n\nToutes les mises seront remboursées.`
    )) return;
    setMessage(null);
    demarrer(async () => {
      const r = await annulerMarche(marche.id);
      setMessage(r.ok ? `Remboursé : ${formatCentimes(r.data.rembourse)}` : r.erreur);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="app-surface rounded-[var(--radius-lg)] border p-4 lg:p-5">
      <div className="flex items-baseline justify-between gap-2 text-[11px]
                      text-[var(--muted-foreground)]">
        <span>
          {marche.status === "resolved" ? "Résolu"
            : marche.status === "cancelled" ? "Annulé"
            : marche.status === "closed" ? "À résoudre"
            : `Ouvert · ${tempsRestant(marche.closes_at)}`}
        </span>
        <span className="tabular">{formatCentimes(marche.cagnotte)}</span>
      </div>

      <p className="mt-1 text-[14px] font-medium leading-snug">{marche.question}</p>

      {regle ? (
        <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">
          Issue retenue :{" "}
          {issues.find((i) => i.id === marche.resolved_outcome_id)?.label ?? "—"}
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            {issues.map((issue, i) => (
              <label
                key={issue.id}
                className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)]
                            border px-3 py-2 text-[13px] ${
                              choix === issue.id ? "bg-[var(--accent)]" : ""
                            }`}
                style={choix === issue.id ? { borderColor: couleurIssue(i) } : undefined}
              >
                <input
                  type="radio"
                  name={`issue-${marche.id}`}
                  checked={choix === issue.id}
                  onChange={() => setChoix(issue.id)}
                  className="accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1 truncate">{issue.label}</span>
                <span className="tabular text-[var(--muted-foreground)]">
                  {formatCentimes(issue.mises)} · {formatPourcentage(parts[i])}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={annuler}
              disabled={enCours}
              className="rounded-[var(--radius-md)] border px-3 py-2.5 text-[13px] font-medium
                         text-[var(--destructive)] disabled:opacity-50"
            >
              Annuler le marché
            </button>
            <button
              type="button"
              onClick={resoudre}
              disabled={choix === null || enCours}
              className="min-w-0 flex-1 rounded-[var(--radius-md)] bg-[var(--primary)] px-3 py-2.5
                         text-[13px] font-semibold text-[var(--primary-foreground)]
                         disabled:opacity-40"
            >
              {enCours ? "…" : "Résoudre et payer"}
            </button>
          </div>
        </>
      )}

      {message && (
        <p role="status" className="mt-2 text-[12px] font-medium">{message}</p>
      )}
    </div>
  );
}
