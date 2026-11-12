import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JEUX, styleJeu, type CleJeu } from "@/components/divertissement/jeux";
import { formatCentimes } from "@/lib/money";
import { soldeCentimes } from "@/lib/queries";
import { utilisateurCourant } from "@/lib/session";
import { toiletVisible } from "@/lib/toilet";

export const dynamic = "force-dynamic";

const dateDuJour = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris",
});

/*
 * Onglet Divertissement : une salle de jeux, un cube de couleur par
 * activité (identités dans components/divertissement/jeux.tsx). Le
 * marché garde ses propres pages sous /marche ; les réels et les vidéos
 * éducatives sont sous /divertissement.
 */
export default async function PageDivertissement() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  // Rubrique cachée : le cube n'existe que pour les membres passés par le lien secret.
  const toilet = await toiletVisible(u.id);

  const cubes: { cle: CleJeu; detail: React.ReactNode }[] = [
    { cle: "courbes", detail: "Duel de fonctions, à l’aveugle" },
    { cle: "toile", detail: "Un pixel toutes les 5 minutes" },
    { cle: "videos", detail: "Explications filmées par la classe" },
    { cle: "reels", detail: "Des nombres réels, en vertical" },
  ];
  if (toilet) cubes.push({ cle: "toilet", detail: "Le classement des toilettes du bas" });

  return (
    <main className="salle">
      <header className="mb-7">
        <p className="salle__date">{dateDuJour.format(new Date())}</p>
        <h1 className="jeu-titre salle__titre">Divertissement</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Cube cle="marche" large
              detail={<Suspense fallback="Les paris de la classe"><Solde userId={u.id} /></Suspense>} />
        {cubes.map((c, i) => (
          // Nombre impair : le dernier cube prend toute la largeur.
          <Cube key={c.cle} cle={c.cle} detail={c.detail} large={i === cubes.length - 1 && cubes.length % 2 === 1} />
        ))}
      </div>
    </main>
  );
}

function Cube({ cle, detail, large = false }: { cle: CleJeu; detail: React.ReactNode; large?: boolean }) {
  const { nom, href, Icone } = JEUX[cle];
  return (
    <Link href={href} className={large ? "cube cube--large col-span-2" : "cube"} style={styleJeu(cle)}>
      <Icone />
      <span className="min-w-0">
        <span className="cube__nom">{nom}</span>
        <span className="cube__detail">{detail}</span>
      </span>
    </Link>
  );
}

async function Solde({ userId }: { userId: string }) {
  return <>Solde : {formatCentimes(await soldeCentimes(userId))}</>;
}
