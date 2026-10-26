import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListeDocuments } from "@/components/ListeDocuments";
import { DepotDocuments } from "@/components/DepotDocuments";
import { SqueletteListe } from "@/components/Squelettes";
import { BarreDossier } from "@/components/BarreDossier";
import { LigneDossier } from "@/components/LigneDossier";
import {
  corbeille, documentsDuDossier, documentsRecents, rechercherDocuments, usage,
} from "@/lib/documents";
import { cheminsDe, gestionDe, listerDossiers, type DossierVue } from "@/lib/dossiers";
import { chemin, comparerNoms, destinations, libelleChemin } from "@/lib/arbre-dossiers";
import { PROFONDEUR_MAX_DOSSIERS } from "@/lib/constantes";
import { formatTaille } from "@/lib/stockage";
import { listerMatieres } from "@/lib/matieres";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ q?: string; dossier?: string; vue?: string }>;

export default async function PageDocuments({ searchParams }: { searchParams: Params }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const p = await searchParams;
  const recherche = (p.q ?? "").trim();
  const vue = p.vue === "recents" || p.vue === "corbeille" ? p.vue : "dossiers";
  const dossierId = /^\d+$/.test(p.dossier ?? "") ? Number(p.dossier) : null;

  // Les dossiers servent à l'en-tête (dépôt), à l'explorateur et aux
  // chemins affichés : une seule lecture pour toute la page.
  const dossiers = await listerDossiers("document");
  if (dossierId !== null && !dossiers.some((d) => d.id === dossierId)) redirect("/documents");
  const moi = { id: u.id, role: u.role };

  return (
    <main>
      <Suspense fallback={<header className="page-heading"><h1>Documents</h1></header>}>
        <EnTete userId={u.id} dossiers={dossiers} dossierId={vue === "dossiers" && !recherche ? dossierId : null} />
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
        <Onglet href="/documents" actif={!recherche && vue === "dossiers"} label="Dossiers" />
        <Onglet href="/documents?vue=recents" actif={!recherche && vue === "recents"} label="Récents" />
        <Onglet href="/documents?vue=corbeille" actif={!recherche && vue === "corbeille"} label="Corbeille" />
      </nav>

      <div className="mt-6">
        <Suspense fallback={<SqueletteListe n={5} />}>
          {recherche ? (
            <Resultats terme={recherche} userId={u.id} estAdmin={u.role === "admin"} dossiers={dossiers} />
          ) : vue === "corbeille" ? (
            <Corbeille userId={u.id} estAdmin={u.role === "admin"} />
          ) : vue === "recents" ? (
            <Recents userId={u.id} estAdmin={u.role === "admin"} dossiers={dossiers} />
          ) : (
            <Explorateur dossiers={dossiers} dossierId={dossierId} moi={moi} />
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
async function EnTete({
  userId, dossiers, dossierId,
}: { userId: string; dossiers: DossierVue[]; dossierId: number | null }) {
  const [us, matieres] = await Promise.all([usage(userId), listerMatieres()]);
  const partMembre = Math.min(1, us.utilise_membre / us.quota_membre);
  const partGlobale = Math.min(1, us.utilise_global / us.plafond_global);
  const restant = Math.max(0, us.quota_membre - us.utilise_membre);
  const courant = dossiers.find((d) => d.id === dossierId);

  return (
    <DepotDocuments
      restant={restant} matieres={matieres.map(({ id, nom }) => ({ id, nom }))}
      dossier={courant
        ? { id: courant.id, chemin: libelleChemin(dossiers, courant.id), matiere: courant.subject_id }
        : null}>
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

async function Recents({
  userId, estAdmin, dossiers,
}: { userId: string; estAdmin: boolean; dossiers: DossierVue[] }) {
  const docs = await documentsRecents(50);
  return (
    <ListeDocuments documents={docs} moi={userId} estAdmin={estAdmin}
                    chemins={cheminsDe(dossiers)} destinations={destinations(dossiers)} />
  );
}

async function Resultats({
  terme, userId, estAdmin, dossiers,
}: { terme: string; userId: string; estAdmin: boolean; dossiers: DossierVue[] }) {
  const docs = await rechercherDocuments(terme);
  return (
    <>
      <p className="etiquette mb-2">
        {docs.length} résultat{docs.length > 1 ? "s" : ""} pour « {terme} »
      </p>
      <ListeDocuments documents={docs} moi={userId} estAdmin={estAdmin}
                      chemins={cheminsDe(dossiers)} destinations={destinations(dossiers)} />
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

/*
 * Vue « Dossiers » : on entre dans un dossier à la fois, avec son fil
 * d'Ariane. À la racine : les dossiers, puis les documents non rangés.
 */
async function Explorateur({
  dossiers, dossierId, moi,
}: {
  dossiers: DossierVue[];
  dossierId: number | null;
  moi: { id: string; role: "member" | "admin" };
}) {
  const [docs, matieres] = await Promise.all([documentsDuDossier(dossierId), listerMatieres()]);
  const matieresForm = matieres.map(({ id, nom }) => ({ id, nom }));
  const fil = chemin(dossiers, dossierId);
  const courant = fil[fil.length - 1];
  const enfants = dossiers
    .filter((d) => d.parent_id === dossierId)
    .sort((a, b) => a.rang - b.rang || comparerNoms(a.nom, b.nom));
  const contenuDans = contenuRecursif(dossiers);

  return (
    <>
      {courant && (
        <nav aria-label="Fil d’Ariane" className="mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px]">
          <Link href="/documents" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            Documents
          </Link>
          {fil.map((d, i) => (
            <span key={d.id} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="text-[var(--muted-foreground)]">›</span>
              {i === fil.length - 1 ? (
                <span aria-current="page" className="font-semibold">{d.nom}</span>
              ) : (
                <Link href={`/documents?dossier=${d.id}`}
                      className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                  {d.nom}
                </Link>
              )}
            </span>
          ))}
        </nav>
      )}

      <BarreDossier
        kind="document" parentId={dossierId} matieres={matieresForm}
        peutCreer={fil.length < PROFONDEUR_MAX_DOSSIERS}
        gestion={courant ? gestionDe(courant, dossiers, moi, matieresForm) : undefined}
      />

      {enfants.length > 0 && (
        <ul>
          {enfants.map((d) => {
            const sous = dossiers.filter((x) => x.parent_id === d.id).length;
            const n = contenuDans.get(d.id) ?? 0;
            const meta = [
              d.parent_id === null && d.matiere !== d.nom ? d.matiere : null,
              sous > 0 ? `${sous} dossier${sous > 1 ? "s" : ""}` : null,
              `${n} document${n > 1 ? "s" : ""}`,
            ].filter(Boolean).join(" · ");
            return (
              <LigneDossier key={d.id} nom={d.nom} meta={meta} couleur={d.couleur}
                            href={`/documents?dossier=${d.id}`}
                            gestion={gestionDe(d, dossiers, moi, matieresForm)} />
            );
          })}
        </ul>
      )}

      {docs.length > 0 && enfants.length > 0 && (
        <h2 className="etiquette mt-8">{courant ? "Documents" : "Hors dossier"}</h2>
      )}
      <ListeDocuments
        documents={docs} moi={moi.id} estAdmin={moi.role === "admin"}
        destinations={destinations(dossiers)}
        vide={enfants.length > 0 ? "" : courant ? "Ce dossier est vide." : "Aucun document pour l’instant."}
      />
    </>
  );
}

/** Nombre de documents dans chaque dossier, sous-dossiers compris. */
function contenuRecursif(dossiers: DossierVue[]): Map<number, number> {
  const total = new Map<number, number>();
  for (const d of dossiers) {
    // Remonte la chaîne des parents : un document compte pour tous ses ancêtres.
    for (const a of chemin(dossiers, d.id)) total.set(a.id, (total.get(a.id) ?? 0) + d.nb_elements);
  }
  return total;
}
