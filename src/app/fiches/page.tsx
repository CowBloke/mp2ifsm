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

type Moi = { id: string; role: "member" | "admin" };
type Matieres = Array<{ id: number; nom: string }>;

/*
 * Une seule liste, par matière puis chapitre. Les paquets suivis
 * portent le nombre de cartes dues ; les autres, un bouton « Suivre ».
 */
export default async function PageFiches() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");

  const [matieres, dossiers, paquets] = await Promise.all([
    listerMatieres(true), listerDossiers("deck"), listerPaquets(u.id),
  ]);
  const matieresActives = matieres.filter((m) => !m.archivee).map(({ id, nom }) => ({ id, nom }));

  return (
    <main>
      <OutilsPaquets
        matieres={matieresActives}
        dossiers={destinations(dossiers, { avecMatiere: true })}
      />
      <Liste
        paquets={paquets} dossiers={dossiers} matieres={matieres}
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
  paquets, dossiers, matieres, matieresActives, moi,
}: {
  paquets: PaquetVue[];
  dossiers: DossierVue[];
  matieres: Array<{ id: number; nom: string; couleur: string; archivee: boolean }>;
  matieresActives: Matieres;
  moi: Moi;
}) {
  if (paquets.length === 0 && dossiers.length === 0) {
    return <p className="text-[15px] text-[var(--muted-foreground)]">Aucun paquet.</p>;
  }

  const sousArbre = (n: Noeud<DossierVue>): PaquetVue[] => [
    ...paquets.filter((p) => p.folder_id === n.id), ...n.enfants.flatMap(sousArbre),
  ];

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
    groupe(n.subject_id, n.matiere ?? null, n.couleur).racines.push(n);
  }
  for (const p of paquets) {
    if (p.folder_id === null) groupe(p.subject_id, p.matiere, p.couleur).paquets.push(p);
  }

  const ordre = [...groupes.values()].sort((a, b) => a.rang - b.rang);
  const ctx = { paquets, dossiers, matieresActives, moi, sousArbre };

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
            {g.paquets.sort(parChapitre).map((p) => <LignePaquet key={p.id} p={p} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Contexte = {
  paquets: PaquetVue[];
  dossiers: DossierVue[];
  matieresActives: Matieres;
  moi: Moi;
  sousArbre: (n: Noeud<DossierVue>) => PaquetVue[];
};

const duDe = (p: PaquetVue) => (p.abonne ? p.apprentissage + p.a_revoir + p.nouvelles : 0);

function Dossier({ n, ctx }: { n: Noeud<DossierVue>; ctx: Contexte }) {
  const du = ctx.sousArbre(n).reduce((t, p) => t + duDe(p), 0);
  const direct = ctx.paquets.filter((p) => p.folder_id === n.id).sort(parChapitre);

  return (
    <LigneDossier
      nom={n.nom} couleur={n.couleur} defautOuvert={du > 0}
      badge={du > 0 ? <span className="pastille-compte">{du}</span> : undefined}
      gestion={gestionDe(n, ctx.dossiers, ctx.moi, ctx.matieresActives)}
    >
      {n.enfants.map((e) => <Dossier key={`d${e.id}`} n={e} ctx={ctx} />)}
      {direct.map((p) => <LignePaquet key={p.id} p={p} />)}
      {direct.length === 0 && n.enfants.length === 0 && (
        <li className="py-3 text-[13px] text-[var(--muted-foreground)]">Vide</li>
      )}
    </LigneDossier>
  );
}

/** Le numéro de chapitre tient lieu d'étiquette : une colonne étroite à gauche. */
function LignePaquet({ p }: { p: PaquetVue }) {
  const du = duDe(p);
  return (
    <li className="ligne gap-3">
      <Link href={`/fiches/${p.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span aria-hidden="true" className="tabular w-6 shrink-0 text-[14px] text-[var(--muted-foreground)]">
          {/^\d{1,2}$/.test(p.chapitre) ? p.chapitre : ""}
        </span>
        <span className="ligne__titre min-w-0 flex-1 [overflow-wrap:anywhere]">{p.titre}</span>
      </Link>
      {!p.abonne ? (
        <BoutonSuivre deckId={p.id} abonne={false} compact />
      ) : du > 0 ? (
        <Link href={`/fiches/${p.slug}/reviser`} className="pastille-compte"
              aria-label={`Réviser ${du} carte${du > 1 ? "s" : ""} de ${p.titre}`}>{du}</Link>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="À jour"
             className="mx-1.5 shrink-0 text-[var(--muted-foreground)]">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </li>
  );
}
