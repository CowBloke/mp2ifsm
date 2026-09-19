import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListeDocuments } from "@/components/ListeDocuments";
import { Televersement } from "@/components/Televersement";
import { SqueletteListe } from "@/components/Squelettes";
import {
  arborescence, corbeille, documentsParMatiere, documentsRecents,
  rechercherDocuments, usage,
} from "@/lib/documents";
import { formatTaille } from "@/lib/stockage";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = Promise<{
  q?: string; matiere?: string; chapitre?: string; vue?: string;
}>;

export default async function PageDocuments({ searchParams }: { searchParams: Params }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const p = await searchParams;
  const recherche = (p.q ?? "").trim();
  const vue = p.vue ?? (recherche ? "recherche" : p.matiere !== undefined ? "matiere" : "recents");

  return (
    <main className="py-4">
      <h1 className="text-[22px] font-bold leading-tight">Documents</h1>
      <p className="mb-4 text-[13px] text-[var(--muted-foreground)]">
        Cours, corrigés et fiches partagés par la classe.
      </p>

      <Suspense fallback={<div className="skeleton h-16 w-full" />}>
        <Occupation userId={u.id} />
      </Suspense>

      {/* Recherche : nom de fichier, mots-clés, déposant. */}
      <form action="/documents" className="mt-4">
        <input
          type="search" name="q" defaultValue={recherche}
          placeholder="Rechercher un document, un mot-clé, un nom…"
          className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2.5 text-[14px]
                     outline-none focus:border-[var(--ring)]"
        />
      </form>

      <nav className="mt-3 flex gap-2 text-[13px]">
        <Onglet href="/documents?vue=recents" actif={vue === "recents"} label="Récents" />
        <Onglet href="/documents?vue=classement" actif={vue === "classement" || vue === "matiere"}
                label="Par matière" />
        <Onglet href="/documents?vue=corbeille" actif={vue === "corbeille"} label="Corbeille" />
      </nav>

      <div className="mt-4">
        <Suspense fallback={<SqueletteListe n={5} />}>
          {recherche ? (
            <Resultats terme={recherche} userId={u.id} estAdmin={u.role === "admin"} />
          ) : vue === "corbeille" ? (
            <Corbeille userId={u.id} estAdmin={u.role === "admin"} />
          ) : vue === "classement" && p.matiere === undefined !== undefined ? (
            <Arborescence />
          ) : p.matiere !== undefined ? (
            <ParMatiere matiere={p.matiere} chapitre={p.chapitre ?? null}
                        userId={u.id} estAdmin={u.role === "admin"} />
          ) : (
            <Recents userId={u.id} estAdmin={u.role === "admin"} />
          )}
        </Suspense>
      </div>
    </main>
  );
}

function Onglet({ href, actif, label }: { href: string; actif: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
        actif
          ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
          : "border text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
      }`}
    >
      {label}
    </Link>
  );
}

/*
 * Jauge d'occupation : le Pi ne doit jamais se remplir en silence.
 * Deux barres — la vôtre et celle de la classe.
 */
async function Occupation({ userId }: { userId: string }) {
  const us = await usage(userId);
  const partMembre = Math.min(1, us.utilise_membre / us.quota_membre);
  const partGlobale = Math.min(1, us.utilise_global / us.plafond_global);
  const restant = Math.max(0, us.quota_membre - us.utilise_membre);

  return (
    <div className="rounded-[var(--radius-lg)] border bg-[var(--card)] p-3">
      <Jauge
        label="Votre espace" part={partMembre}
        detail={`${formatTaille(us.utilise_membre)} / ${formatTaille(us.quota_membre)}`}
        alerte={partMembre > 0.9}
      />
      <div className="mt-2">
        <Jauge
          label="Espace de la classe" part={partGlobale}
          detail={`${formatTaille(us.utilise_global)} / ${formatTaille(us.plafond_global)}`}
          alerte={partGlobale > 0.9}
        />
      </div>
      <div className="mt-3">
        <Televersement restant={restant} />
      </div>
    </div>
  );
}

function Jauge({
  label, part, detail, alerte,
}: { label: string; part: number; detail: string; alerte: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-medium">{label}</span>
        <span className="tabular text-[var(--muted-foreground)]">{detail}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]"
           role="progressbar" aria-valuenow={Math.round(part * 100)}
           aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full transition-[width]"
             style={{ width: `${Math.max(1, part * 100)}%`,
                      background: alerte ? "var(--destructive)" : "var(--primary)" }} />
      </div>
    </div>
  );
}

async function Recents({ userId, estAdmin }: { userId: string; estAdmin: boolean }) {
  const docs = await documentsRecents(50);
  return <ListeDocuments documents={docs} moi={userId} estAdmin={estAdmin} />;
}

async function Resultats({
  terme, userId, estAdmin,
}: { terme: string; userId: string; estAdmin: boolean }) {
  const docs = await rechercherDocuments(terme);
  return (
    <>
      <p className="mb-2 text-[12px] text-[var(--muted-foreground)]">
        {docs.length} résultat{docs.length > 1 ? "s" : ""} pour « {terme} »
      </p>
      <ListeDocuments documents={docs} moi={userId} estAdmin={estAdmin} />
    </>
  );
}

async function Corbeille({ userId, estAdmin }: { userId: string; estAdmin: boolean }) {
  const docs = await corbeille(userId, estAdmin);
  return (
    <>
      <p className="mb-2 text-[12px] text-[var(--muted-foreground)]">
        Les fichiers supprimés restent récupérables 30 jours, puis sont effacés du disque.
      </p>
      <ListeDocuments documents={docs} moi={userId} estAdmin={estAdmin} corbeille />
    </>
  );
}

async function Arborescence() {
  const noeuds = await arborescence();

  if (noeuds.length === 0) {
    return (
      <p className="rounded-[var(--radius-md)] border border-dashed p-6 text-center text-[13px]
                    text-[var(--muted-foreground)]">
        Aucun document classé pour l’instant.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {noeuds.map((n) => (
        <section key={n.matiere ?? "sans"}>
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide
                         text-[var(--muted-foreground)]">
            {n.matiere ?? "Non classé"} ({n.total})
          </h2>
          <ul className="space-y-1.5">
            {n.chapitres.map((c) => (
              <li key={c.chapitre ?? "sans"}>
                <Link
                  href={`/documents?matiere=${encodeURIComponent(n.matiere ?? "")}` +
                        `&chapitre=${encodeURIComponent(c.chapitre ?? "")}`}
                  className="flex items-center justify-between rounded-[var(--radius-md)] border
                             bg-[var(--card)] px-3 py-2.5 transition-colors hover:bg-[var(--muted)]"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px]">
                    {c.chapitre ?? "Sans chapitre"}
                  </span>
                  <span className="tabular shrink-0 text-[11px] text-[var(--muted-foreground)]">
                    {c.n} · {formatTaille(c.taille)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function ParMatiere({
  matiere, chapitre, userId, estAdmin,
}: {
  matiere: string; chapitre: string | null; userId: string; estAdmin: boolean;
}) {
  const docs = await documentsParMatiere(matiere, chapitre);
  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[13px] font-medium">
          {matiere || "Non classé"}{chapitre && ` — ${chapitre}`}
        </p>
        <Link href="/documents?vue=classement"
              className="text-[12px] text-[var(--muted-foreground)] underline">
          Toutes les matières
        </Link>
      </div>
      <ListeDocuments documents={docs} moi={userId} estAdmin={estAdmin} />
    </>
  );
}
