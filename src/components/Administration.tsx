import { AdminPanel, type AdminUser } from "@/components/AdminPanel";
import { query } from "@/lib/db";
import { proposals } from "@/lib/proposals";
import { listerMatieres } from "@/lib/matieres";
import { tousLesRetours } from "@/lib/retours";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CarteResolution, FormulaireMarche } from "@/components/AdminMarches";
import { SqueletteListe } from "@/components/Squelettes";
import { formatCentimes } from "@/lib/money";
import { listerMarchesAdmin, rapprochement } from "@/lib/queries";
import { utilisateurCourant } from "@/lib/session";

export async function Administration({ userId }: { userId: string }) {
  const u = await utilisateurCourant();
  if (!u || u.role !== "admin") return null;
  const [users, items, matieres, retours] = await Promise.all([
    query<AdminUser>(`select u.id,u.display_name,u.email,u.role,u.created_at,
      (select count(*)::int from user_session s where s.user_id=u.id and s.expires_at>now()) as sessions
      from app_user u order by u.created_at desc`), proposals(), listerMatieres(true), tousLesRetours(),
  ]);
  return <AdminPanel currentId={userId} users={JSON.parse(JSON.stringify(users))} proposals={JSON.parse(JSON.stringify(items))}
                     matieres={matieres} retours={JSON.parse(JSON.stringify(retours))}>
    <FormulaireMarche /><Controle /><Marches userId={userId} />
  </AdminPanel>;
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
