"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { placerPari } from "@/lib/actions";
import {
  cotesImplicites, estimerGain, formatCentimes, formatMontantBrut, formatPourcentage, parseMontant,
} from "@/lib/money";
import type { MarcheVue } from "@/lib/queries";

/*
 * Miser, directement sur la page du marché : une issue, un montant, un
 * bouton. Le gain affiché est une ESTIMATION au cours actuel ; le
 * montant qui fait foi est celui que le serveur renvoie après écriture
 * dans le grand livre.
 */

const MISE_MINIMUM = 10; // centimes
const RAPIDES = [100, 500, 1000, 2000];

type Etat =
  | { phase: "saisie" }
  | { phase: "envoi" }
  | { phase: "confirme"; mise: number; solde: number; issue: string }
  | { phase: "erreur"; message: string };

export function PanneauPari({ marche, solde }: { marche: MarcheVue; solde: number }) {
  const router = useRouter();
  const issues = marche.issues ?? [];
  const parts = cotesImplicites(issues.map((i) => i.mises));
  const ouvert = marche.status === "open";

  const [issueId, setIssueId] = useState<number | null>(issues[0]?.id ?? null);
  const [montant, setMontant] = useState(solde >= 500 ? formatMontantBrut(500) : "");
  const [etat, setEtat] = useState<Etat>({ phase: "saisie" });
  /* Une clé par tentative : réessayer après une coupure réseau rejoue la
   * MÊME clé et ne peut donc pas créer un second pari. */
  const [cle, setCle] = useState(() => crypto.randomUUID());

  if (!ouvert) {
    return (
      <ul>
        {issues.map((i, n) => {
          const gagnante = i.id === marche.resolved_outcome_id;
          return (
            <li key={i.id} className="ligne">
              <span className={`flex-1 text-[17px] ${gagnante ? "font-semibold" : ""}`}>
                {i.label}{gagnante && <span className="text-[var(--muted-foreground)]"> · gagnante</span>}
              </span>
              <span className="text-[17px] font-semibold">{formatPourcentage(parts[n])}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  if (etat.phase === "confirme") {
    return (
      <div role="status" className="flex flex-col gap-6">
        <div>
          <p className="text-[24px] font-semibold tracking-[-0.01em]">Mise enregistrée</p>
          <p className="mt-2 text-[15px] text-[var(--muted-foreground)]">
            {formatCentimes(etat.mise)} sur « {etat.issue} » · nouveau solde {formatCentimes(etat.solde)}
          </p>
        </div>
        <button type="button" className="bouton-principal" onClick={() => setEtat({ phase: "saisie" })}>
          Terminé
        </button>
      </div>
    );
  }

  const centimes = parseMontant(montant);
  const issue = issues.find((i) => i.id === issueId) ?? null;
  const tropCher = centimes !== null && centimes > solde;
  const tropPetit = centimes !== null && centimes < MISE_MINIMUM;
  const peutValider = issue !== null && centimes !== null && !tropCher && !tropPetit && etat.phase !== "envoi";
  const gain = issue && centimes !== null && !tropPetit ? estimerGain(centimes, marche.cagnotte, issue.mises) : null;

  async function valider() {
    if (!peutValider || !issue) return;
    setEtat({ phase: "envoi" });
    const r = await placerPari(issue.id, montant, cle);
    if (r.ok) {
      setEtat({ phase: "confirme", mise: r.data.miseCentimes, solde: r.data.soldeCentimes, issue: issue.label });
      setCle(crypto.randomUUID());
      router.refresh();
    } else {
      setEtat({ phase: "erreur", message: r.erreur });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div role="radiogroup" aria-label="Issue" className="flex flex-col gap-2.5">
        {issues.map((i, n) => {
          const choisie = i.id === issueId;
          return (
            <button key={i.id} type="button" role="radio" aria-checked={choisie}
                    onClick={() => setIssueId(i.id)}
                    className={`flex h-[60px] items-center gap-3.5 rounded-[var(--radius-lg)] bg-[var(--card)] px-[18px]
                                text-left ${choisie ? "border-2 border-[var(--foreground)]" : "border border-[var(--border)] hover:bg-[var(--muted)]"}`}>
              <span className="min-w-0 flex-1 truncate text-[17px] font-medium">{i.label}</span>
              {i.ma_mise > 0 && (
                <span className="text-[13px] text-[var(--muted-foreground)]">vous {formatCentimes(i.ma_mise)}</span>
              )}
              <span className="text-[17px] font-semibold">{formatPourcentage(parts[n])}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3.5">
        <label htmlFor="montant" className="etiquette">Montant</label>
        <div className="flex items-baseline gap-1">
          <input id="montant" inputMode="decimal" autoComplete="off" placeholder="0,00" value={montant}
                 onChange={(e) => { setMontant(e.target.value); if (etat.phase === "erreur") setEtat({ phase: "saisie" }); }}
                 className="champ-nu w-full min-w-0 border-0 bg-transparent p-0 text-[44px] font-semibold
                            leading-none tracking-[-0.03em] outline-none placeholder:text-[var(--muted-foreground)]" />
          <span className="text-[44px] font-semibold leading-none text-[var(--muted-foreground)]">€</span>
        </div>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Montants rapides">
          {RAPIDES.map((v) => (
            <button key={v} type="button" disabled={v > solde}
                    aria-pressed={centimes === v}
                    onClick={() => setMontant(formatMontantBrut(v))}
                    className="puce h-11 justify-center disabled:opacity-40">
              {v / 100} €
            </button>
          ))}
        </div>
      </div>

      <p className="text-[15px] text-[var(--muted-foreground)]" aria-live="polite">
        {issue && gain !== null ? (
          <>Gain estimé si {issue.label} : <strong className="font-semibold text-[var(--foreground)]">{formatCentimes(gain)}</strong></>
        ) : "Choisissez une issue et un montant."}
      </p>

      {(etat.phase === "erreur" || tropCher || tropPetit) && (
        <p role="alert" className="-mt-4 text-[14px] font-medium text-[var(--destructive)]">
          {etat.phase === "erreur" ? etat.message : tropCher ? "Solde insuffisant" : "Mise minimum : 0,10 €"}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={valider} disabled={!peutValider} className="bouton-principal">
          {etat.phase === "envoi" ? "Enregistrement…"
            : centimes !== null && issue ? `Miser ${formatCentimes(centimes)} sur ${issue.label}` : "Miser"}
        </button>
        <p className="text-center text-[13px] text-[var(--muted-foreground)]">
          Solde : {formatCentimes(solde)} · une mise est définitive
        </p>
      </div>
    </div>
  );
}
