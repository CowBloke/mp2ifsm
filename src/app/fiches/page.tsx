import Link from "next/link";
import { redirect } from "next/navigation";
import { OutilsPaquets } from "@/components/OutilsFiches";
import { BoutonSuivre } from "@/components/BoutonSuivre";
import { LigneDossier } from "@/components/LigneDossier";
import { styleMatiere } from "@/components/Matiere";
import { comparerNoms, construireArbre, destinations, type Noeud } from "@/lib/arbre-dossiers";
import { gestionDe, listerDossiers, type DossierVue } from "@/lib/dossiers";
import { listerPaquets, type PaquetVue } from "@/lib/fiches";
import { listerMatieres } from "@/lib/matieres";
import { utilisateurCourant } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ vue?: string }>;
type Moi = { id: string; role: "member" | "admin" };
type Matieres = Array<{ id: number; nom: string }>;

export default async function PageFiches({ searchParams }: { searchParams: Params }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const [{ vue: vueDemandee }, matieres, dossiers, paquets] = await Promise.all([
    searchParams, listerMatieres(true), listerDossiers("deck"), listerPaquets(u.id),
  ]);
  const matieresActives = matieres.filter((m) => !m.archivee).map(({ id, nom }) => ({ id, nom }));
  // Qui ne suit encore rien arrive directement sur le catalogue de la classe.
  const suit = paquets.some((p) => p.abonne);
  const vue = vueDemandee === "tous" || (vueDemandee !== "suivis" && !suit) ? "tous" : "suivis";

  return (
    <main>
      <OutilsPaquets
        matieres={matieresActives}
        dossiers={destinations(dossiers, { avecMatiere: true })}
      />

      {paquets.length > 0 && (
        <nav aria-label="Vues" className="-mt-4 mb-8 flex flex-wrap gap-2">
          <Link href="/fiches?vue=suivis" aria-current={vue === "suivis" ? "page" : undefined} className="puce">
            Mes paquets
          </Link>
          <Link href="/fiches?vue=tous" aria-current={vue === "tous" ? "page" : undefined} className="puce">
            Tous les paquets
          </Link>
        </nav>
      )}

      <Liste
        vue={vue} paquets={paquets} dossiers={dossiers} matieres={matieres}
        matieresActives={matieresActives} moi={{ id: u.id, role: u.role }}
      />
    </main>
  );
}

type Groupe = {
  cle: string;
  nom: string | null;
  couleur: string | null;
  rang: number;
  racines: Noeud<DossierVue>[];
  paquets: PaquetVue[];
};

const rangDe = (matieres: Array<{ id: number }>, id: number | null) =>
  id === null ? matieres.length : matieres.findIndex((m) => m.id === id);

const parChapitre = (a: PaquetVue, b: PaquetVue) =>
  comparerNoms(a.chapitre, b.chapitre) || comparerNoms(a.titre, b.titre);

function Liste({
  vue, paquets, dossiers, matieres, matieresActives, moi,
}: {
  vue: "suivis" | "tous";
  paquets: PaquetVue[];
  dossiers: DossierVue[];
  matieres: Array<{ id: number; nom: string; couleur: string; archivee: boolean }>;
  matieresActives: Matieres;
  moi: Moi;
}) {
  if (paquets.length === 0 && dossiers.length === 0) {
    return (
      <p className="text-[15px] text-[var(--muted-foreground)]">
        Aucun paquet. Créez-en un avec « + », ou importez un paquet Anki.
      </p>
    );
  }

  const visibles = vue === "suivis" ? paquets.filter((p) => p.abonne) : paquets;
  if (vue === "suivis" && visibles.length === 0) {
    return (
      <p className="text-[15px] text-[var(--muted-foreground)]">
        Vous ne suivez aucun paquet.{" "}
        <Link href="/fiches?vue=tous" className="lien-discret underline">Parcourir ceux de la classe</Link>
      </p>
    );
  }

  // Un dossier n'apparaît dans « Mes paquets » que s'il contient (même
  // profondément) un paquet suivi ; dans « Tous », même vide, pour qu'on
  // puisse le remplir ou le supprimer.
  const sousArbre = (n: Noeud<DossierVue>): PaquetVue[] => [
    ...visibles.filter((p) => p.folder_id === n.id), ...n.enfants.flatMap(sousArbre),
  ];
  const garder = (n: Noeud<DossierVue>) => vue === "tous" || sousArbre(n).length > 0;

  const groupes = new Map<string, Groupe>();
  const groupe = (subjectId: number | null, nom: string | null, couleur: string | null) => {
    const cle = String(subjectId ?? "");
    let g = groupes.get(cle);
    if (!g) {
      g = { cle, nom, couleur, rang: rangDe(matieres, subjectId), racines: [], paquets: [] };
      groupes.set(cle, g);
    }
    return g;
  };
  for (const n of construireArbre(dossiers)) {
    if (garder(n)) groupe(n.subject_id, n.matiere ?? null, n.couleur).racines.push(n);
  }
  for (const p of visibles) {
    if (p.folder_id === null) groupe(p.subject_id, p.matiere, p.couleur).paquets.push(p);
  }

  const ordre = [...groupes.values()].sort((a, b) => a.rang - b.rang);
  const ctx = { vue, visibles, dossiers, matieresActives, moi, sousArbre, garder };

  return (
    <div className="page-stack">
      {ordre.map((g) => (
        <section key={g.cle} aria-label={g.nom ?? "Sans matière"}>
          <h2 className="etiquette flex items-center gap-2" style={styleMatiere(g.couleur)}>
            <span className="m-plein h-2 w-2 rounded-full" aria-hidden />
            {g.nom ?? "Sans matière"}
          </h2>
          <ul>
            {g.racines.map((n) => <Dossier key={`d${n.id}`} n={n} ctx={ctx} />)}
            {g.paquets.sort(parChapitre).map((p) => <LignePaquet key={p.id} p={p} vue={vue} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Contexte = {
  vue: "suivis" | "tous";
  visibles: PaquetVue[];
  dossiers: DossierVue[];
  matieresActives: Matieres;
  moi: Moi;
  sousArbre: (n: Noeud<DossierVue>) => PaquetVue[];
  garder: (n: Noeud<DossierVue>) => boolean;
};

function Dossier({ n, ctx }: { n: Noeud<DossierVue>; ctx: Contexte }) {
  const contenu = ctx.sousArbre(n);
  const du = contenu.reduce((t, p) => t + p.apprentissage + p.a_revoir + p.nouvelles, 0);
  const cartes = contenu.reduce((t, p) => t + p.total, 0);
  const meta = `${contenu.length} paquet${contenu.length > 1 ? "s" : ""} · ${cartes} carte${cartes > 1 ? "s" : ""}`;
  const direct = ctx.visibles.filter((p) => p.folder_id === n.id).sort(parChapitre);

  return (
    <LigneDossier
      nom={n.nom} meta={meta} couleur={n.couleur}
      defautOuvert={ctx.vue === "suivis" && du > 0}
      badge={ctx.vue === "suivis" && du > 0 ? <span className="pastille-compte">{du}</span> : undefined}
      gestion={ctx.vue === "tous" ? gestionDe(n, ctx.dossiers, ctx.moi, ctx.matieresActives) : undefined}
    >
      {n.enfants.filter(ctx.garder).map((e) => <Dossier key={`d${e.id}`} n={e} ctx={ctx} />)}
      {direct.map((p) => <LignePaquet key={p.id} p={p} vue={ctx.vue} />)}
      {contenu.length === 0 && n.enfants.length === 0 && (
        <li className="py-3 text-[13px] text-[var(--muted-foreground)]">Dossier vide</li>
      )}
    </LigneDossier>
  );
}

function LignePaquet({ p, vue }: { p: PaquetVue; vue: "suivis" | "tous" }) {
  if (vue === "tous") {
    return (
      <li className="ligne">
        <Link href={`/fiches/${p.slug}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="ligne__titre">{p.titre}</span>
          <span className="ligne__meta">
            {p.total} carte{p.total > 1 ? "s" : ""}
            {p.signalements > 0 && (
              <span className="text-[var(--destructive)]"> · {p.signalements} signalée{p.signalements > 1 ? "s" : ""}</span>
            )}
          </span>
        </Link>
        <BoutonSuivre deckId={p.id} abonne={p.abonne} compact />
      </li>
    );
  }

  const du = p.apprentissage + p.a_revoir + p.nouvelles;
  return (
    <li>
      <Link href={`/fiches/${p.slug}`} className="ligne">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="ligne__titre">{p.titre}</span>
          <span className="ligne__meta">
            {p.total} carte{p.total > 1 ? "s" : ""}
            {p.signalements > 0 && (
              <span className="text-[var(--destructive)]"> · {p.signalements} signalée{p.signalements > 1 ? "s" : ""}</span>
            )}
          </span>
        </span>
        {du > 0 ? (
          <span className="pastille-compte">{du}</span>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="À jour"
               className="shrink-0 text-[var(--muted-foreground)]">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </Link>
    </li>
  );
}
