import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CarteResolution, FormulaireMarche } from "@/components/AdminMarches";
import { SqueletteListe } from "@/components/Squelettes";
import { formatCentimes } from "@/lib/money";
import { listerMarchesAdmin, rapprochement } from "@/lib/queries";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PageAdmin() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  // Double barriere : la page refuse le rendu, et chaque action serveur
  // revalide le role de son cote.
  if (u.role !== "admin") redirect("/");

  return (
    <main className="py-4">
      <h1 className="text-[22px] font-bold leading-tight">Administration</h1>
      <p className="mb-4 text-[13px] text-[var(--muted-foreground)]">
        Création et résolution des marchés.
      </p>

      <FormulaireMarche />

      <Suspense fallback={<div className="mt-6"><SqueletteListe n={2} /></div>}>
        <Controle />
      </Suspense>

      <Suspense fallback={<div className="mt-6"><SqueletteListe n={3} /></div>}>
        <Marches userId={u.id} />
      </Suspense>
    </main>
  );
}

/* Rapprochement affiche en continu : si une ligne passe au rouge, le
 * grand livre a un probleme et il faut arreter de regler des marches. */
async function Controle() {
  const lignes = await rapprochement();
  const toutVaBien = lignes.every((l) => l.ok);

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide
                     text-[var(--muted-foreground)]">
        Rapprochement du grand livre
      </h2>
      <div
        className="rounded-[var(--radius-lg)] border-2 bg-[var(--card)] p-3"
        style={{ borderColor: toutVaBien ? "var(--outcome-1)" : "var(--destructive)" }}
      >
        <p className="mb-2 text-[13px] font-semibold"
           style={{ color: toutVaBien ? "var(--outcome-1)" : "var(--destructive)" }}>
          {toutVaBien ? "✓ Comptes équilibrés" : "✗ Incohérence détectée"}
        </p>
        <dl className="space-y-1">
          {lignes.map((l) => (
            <div key={l.controle} className="flex justify-between gap-2 text-[12px]">
              <dt className="text-[var(--muted-foreground)]">{l.controle}</dt>
              <dd className="tabular font-medium"
                  style={{ color: l.ok ? undefined : "var(--destructive)" }}>
                {l.controle.includes("Somme") || l.controle.includes("Avoirs")
                  || l.controle.includes("Dépôts")
                  ? formatCentimes(l.valeur)
                  : l.valeur}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

async function Marches({ userId }: { userId: string }) {
  const marches = await listerMarchesAdmin(userId);
  const aResoudre = marches.filter((m) => m.status === "closed");
  const ouverts = marches.filter((m) => m.status === "open");
  const finis = marches.filter((m) => m.status === "resolved" || m.status === "cancelled");

  return (
    <>
      {aResoudre.length > 0 && (
        <Groupe titre={`À résoudre (${aResoudre.length})`}>
          {aResoudre.map((m) => <CarteResolution key={m.id} marche={m} />)}
        </Groupe>
      )}
      {ouverts.length > 0 && (
        <Groupe titre="Ouverts">
          {ouverts.map((m) => <CarteResolution key={m.id} marche={m} />)}
        </Groupe>
      )}
      {finis.length > 0 && (
        <Groupe titre="Terminés">
          {finis.map((m) => <CarteResolution key={m.id} marche={m} />)}
        </Groupe>
      )}
    </>
  );
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide
                     text-[var(--muted-foreground)]">
        {titre}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
