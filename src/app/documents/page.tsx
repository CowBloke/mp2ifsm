import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListeDocuments } from "@/components/ListeDocuments";
import { DepotDocuments } from "@/components/DepotDocuments";
import { SqueletteListe } from "@/components/Squelettes";
import { LigneDossier } from "@/components/LigneDossier";
import { LienRetour } from "@/components/LienRetour";
import { corbeille, documentsDuDossier, rechercherDocuments, usage } from "@/lib/documents";
import { cheminsDe, gestionDe, listerDossiers, type DossierVue } from "@/lib/dossiers";
import { chemin, comparerNoms, destinations } from "@/lib/arbre-dossiers";
import { PROFONDEUR_MAX_DOSSIERS } from "@/lib/constantes";
import { formatTaille } from "@/lib/stockage";
import { listerMatieres } from "@/lib/matieres";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ q?: string; dossier?: string; vue?: string }>;
type Moi = { id: string; role: "member" | "admin" };

/*
 * Documents : un dossier à la fois, une recherche, et la corbeille en
 * lien discret. Déposer et créer un dossier passent par le « + ».
 */
export default async function PageDocuments({ searchParams }: { searchParams: Params }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const p = await searchParams;
  const recherche = (p.q ?? "").trim();
  const moi: Moi = { id: u.id, role: u.role };

  if (p.vue === "corbeille") {
    return (
      <main>
        <LienRetour href="/documents" label="Retour aux documents" />
        <header className="page-heading"><h1>Corbeille</h1></header>
        <Suspense fallback={<SqueletteListe n={3} />}>
          <Corbeille moi={moi} />
        </Suspense>
      </main>
    );
  }

  const dossierDemande = /^\d+$/.test(p.dossier ?? "") ? Number(p.dossier) : null;
  const dossierId = recherche ? null : dossierDemande;
  const [dossiers, matieres, us] = await Promise.all([
    listerDossiers("document"), listerMatieres(), usage(u.id),
  ]);
  if (dossierDemande !== null && !dossiers.some((d) => d.id === dossierDemande)) redirect("/documents");
  const matieresForm = matieres.map(({ id, nom }) => ({ id, nom }));
  const fil = chemin(dossiers, dossierId);
  const courant = fil[fil.length - 1];
  // L'espace occupé n'apparaît que lorsqu'il devient un problème.
  const presquePlein = us.utilise_membre / us.quota_membre > 0.9;

  return (
    <main>
      <DepotDocuments
        titre={courant?.nom ?? "Documents"}
        quotaAtteint={us.utilise_membre >= us.quota_membre}
        matieres={matieresForm}
        dossier={courant ? { id: courant.id, matiere: courant.subject_id } : null}
        peutCreerDossier={fil.length < PROFONDEUR_MAX_DOSSIERS}
        gestion={courant ? gestionDe(courant, dossiers, moi, matieresForm) : undefined}
      >
        {courant && <FilAriane fil={fil} />}
      </DepotDocuments>

      {presquePlein && (
        <p className="-mt-4 mb-6 text-[14px] text-[var(--destructive)]">
          {formatTaille(us.utilise_membre)} / {formatTaille(us.quota_membre)} utilisés
        </p>
      )}

      {!courant && (
        <form action="/documents" role="search" className="mb-6">
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
      )}

      <Suspense fallback={<SqueletteListe n={5} />}>
        {recherche ? (
          <Resultats terme={recherche} moi={moi} dossiers={dossiers} />
        ) : (
          <Explorateur dossiers={dossiers} dossierId={dossierId} moi={moi} matieres={matieresForm} />
        )}
      </Suspense>
    </main>
  );
}

function FilAriane({ fil }: { fil: DossierVue[] }) {
  return (
    <nav aria-label="Fil d’Ariane" className="mb-1 flex flex-wrap items-center gap-x-1.5 text-[14px]">
      {[{ id: null as number | null, nom: "Documents" }, ...fil.slice(0, -1)].map((d, i) => (
        <span key={d.id ?? "racine"} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true" className="text-[var(--muted-foreground)]">›</span>}
          <Link href={d.id === null ? "/documents" : `/documents?dossier=${d.id}`}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            {d.nom}
          </Link>
        </span>
      ))}
    </nav>
  );
}

async function Resultats({ terme, moi, dossiers }: { terme: string; moi: Moi; dossiers: DossierVue[] }) {
  const docs = await rechercherDocuments(terme);
  return (
    <ListeDocuments documents={docs} moi={moi.id} estAdmin={moi.role === "admin"}
                    chemins={cheminsDe(dossiers)} destinations={destinations(dossiers)}
                    vide={`Rien pour « ${terme} ».`} />
  );
}

async function Corbeille({ moi }: { moi: Moi }) {
  const docs = await corbeille(moi.id, moi.role === "admin");
  return <ListeDocuments documents={docs} moi={moi.id} estAdmin={moi.role === "admin"} corbeille />;
}

async function Explorateur({
  dossiers, dossierId, moi, matieres,
}: {
  dossiers: DossierVue[];
  dossierId: number | null;
  moi: Moi;
  matieres: Array<{ id: number; nom: string }>;
}) {
  const [docs, jetes] = await Promise.all([
    documentsDuDossier(dossierId),
    dossierId === null ? corbeille(moi.id, moi.role === "admin") : Promise.resolve([]),
  ]);
  const enfants = dossiers
    .filter((d) => d.parent_id === dossierId)
    .sort((a, b) => a.rang - b.rang || comparerNoms(a.nom, b.nom));

  return (
    <>
      {enfants.length > 0 && (
        <ul>
          {enfants.map((d) => (
            <LigneDossier key={d.id} nom={d.nom} couleur={d.couleur}
                          href={`/documents?dossier=${d.id}`}
                          gestion={gestionDe(d, dossiers, moi, matieres)} />
          ))}
        </ul>
      )}
      <ListeDocuments
        documents={docs} moi={moi.id} estAdmin={moi.role === "admin"}
        destinations={destinations(dossiers)}
        vide={enfants.length > 0 ? "" : dossierId === null ? "Aucun document." : "Dossier vide."}
      />
      {jetes.length > 0 && (
        <Link href="/documents?vue=corbeille" className="lien-discret mt-6 text-[var(--muted-foreground)]">
          Corbeille ({jetes.length})
        </Link>
      )}
    </>
  );
}
