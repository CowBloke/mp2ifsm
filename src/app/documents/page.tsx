import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListeDocuments } from "@/components/ListeDocuments";
import { DepotDocuments } from "@/components/DepotDocuments";
import { SqueletteListe } from "@/components/Squelettes";
import {
  arborescence, corbeille, documentsParMatiere, documentsRecents,
  rechercherDocuments, usage,
} from "@/lib/documents";
import { formatTaille } from "@/lib/stockage";
import { listerMatieres } from "@/lib/matieres";
import { PastilleMatiere } from "@/components/Matiere";
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
    <main>
      <Suspense fallback={<header className="page-heading"><h1>Documents</h1></header>}>
        <EnTete userId={u.id} />
      </Suspense>

      {/* Recherche : nom de fichier, mots-clés, déposant. */}
      <form action="/documents" role="search">
        <label className="flex h-12 items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--muted)] px-4
                          text-[var(--muted-foreground)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>
          <span className="sr-only">Rechercher un document</span>
          <input type="search" name="q" defaultValue={recherche} placeholder="Rechercher"
                 className="champ-nu min-w-0 flex-1 border-0 bg-transparent text-[16px] text-[var(--foreground)]
                            outline-none placeholder:text-[var(--muted-foreground)]" />
        </label>
      </form>

      <nav aria-label="Vues" className="mt-6 flex flex-wrap gap-2">
        <Onglet href="/documents?vue=recents" actif={!recherche && vue === "recents"} label="Récents" />
        <Onglet href="/documents?vue=classement" actif={!recherche && (vue === "classement" || vue === "matiere")}
                label="Par matière" />
        <Onglet href="/documents?vue=corbeille" actif={!recherche && vue === "corbeille"} label="Corbeille" />
      </nav>

      <div className="mt-6">
        <Suspense fallback={<SqueletteListe n={5} />}>
          {recherche ? (
            <Resultats terme={recherche} userId={u.id} estAdmin={u.role === "admin"} />
          ) : vue === "corbeille" ? (
            <Corbeille userId={u.id} estAdmin={u.role === "admin"} />
          ) : p.matiere !== undefined ? (
            <ParMatiere matiere={p.matiere} chapitre={p.chapitre ?? null}
                        userId={u.id} estAdmin={u.role === "admin"} />
          ) : vue === "classement" ? (
            <Arborescence />
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
    <Link href={href} aria-current={actif ? "page" : undefined} className="puce">{label}</Link>
  );
}

/*
 * En-tête et dépôt. L'espace occupé (le vôtre et celui de la classe)
 * s'affiche avec le formulaire : le Pi ne doit pas se remplir en silence.
 */
async function EnTete({ userId }: { userId: string }) {
  const [us, matieres] = await Promise.all([usage(userId), listerMatieres()]);
  const partMembre = Math.min(1, us.utilise_membre / us.quota_membre);
  const partGlobale = Math.min(1, us.utilise_global / us.plafond_global);
  const restant = Math.max(0, us.quota_membre - us.utilise_membre);

  return (
    <DepotDocuments restant={restant} matieres={matieres.map(({ id, nom }) => ({ id, nom }))}>
      <div className="flex flex-col gap-3">
        <Jauge label="Votre espace" part={partMembre} alerte={partMembre > 0.9}
               detail={`${formatTaille(us.utilise_membre)} / ${formatTaille(us.quota_membre)}`} />
        <Jauge label="Espace de la classe" part={partGlobale} alerte={partGlobale > 0.9}
               detail={`${formatTaille(us.utilise_global)} / ${formatTaille(us.plafond_global)}`} />
      </div>
    </DepotDocuments>
  );
}

function Jauge({
  label, part, detail, alerte,
}: { label: string; part: number; detail: string; alerte: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-[var(--muted-foreground)]">{label}</span>
        <span className="tabular text-[var(--muted-foreground)]">{detail}</span>
      </div>
      <div className="barre mt-1.5"
           role="progressbar" aria-valuenow={Math.round(part * 100)}
           aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span style={{ width: `${Math.max(1, part * 100)}%`,
                       background: alerte ? "var(--destructive)" : "var(--foreground)" }} />
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
      <p className="etiquette mb-2">
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
      <p className="etiquette mb-2">
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
      <p className="text-[15px] text-[var(--muted-foreground)]">
        Aucun document classé pour l’instant.
      </p>
    );
  }

  return (
    <div className="page-stack">
      {noeuds.map((n) => (
        <section key={n.subject_id ?? "sans"} className="min-w-0">
          <h2 className="etiquette">
            <PastilleMatiere nom={n.matiere} couleur={n.couleur} />
          </h2>
          <ul>
            {n.chapitres.map((c) => (
              <li key={c.chapitre ?? "sans"}>
                <Link
                  href={`/documents?matiere=${encodeURIComponent(n.subject_id ?? "")}` +
                        `&chapitre=${encodeURIComponent(c.chapitre ?? "")}`}
                  className="ligne"
                >
                  <span className="ligne__titre min-w-0 flex-1 truncate">
                    {c.chapitre ?? "Sans chapitre"}
                  </span>
                  <span className="ligne__meta shrink-0">
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
  const [docs, matieres] = await Promise.all([
    documentsParMatiere(matiere, chapitre),
    listerMatieres(true),
  ]);
  const m = matieres.find((x) => String(x.id) === matiere);
  return (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
          <PastilleMatiere nom={m?.nom ?? null} couleur={m?.couleur ?? null} />
          {chapitre && <span className="truncate">{chapitre}</span>}
        </p>
        <Link href="/documents?vue=classement" className="lien-discret">
          Toutes les matières
        </Link>
      </div>
      <ListeDocuments documents={docs} moi={userId} estAdmin={estAdmin} />
    </>
  );
}
