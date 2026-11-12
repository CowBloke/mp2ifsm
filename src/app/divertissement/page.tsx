import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCentimes } from "@/lib/money";
import { soldeCentimes } from "@/lib/queries";
import { utilisateurCourant } from "@/lib/session";
import { toiletVisible } from "@/lib/toilet";

export const dynamic = "force-dynamic";

/*
 * Onglet Divertissement : une tuile par activité. Le marché garde ses
 * propres pages sous /marche ; les réels et les vidéos éducatives sont
 * sous /divertissement.
 */
export default async function PageDivertissement() {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  // Rubrique cachée : la tuile n'existe que pour les membres passés par le lien secret.
  const toilet = await toiletVisible(u.id);

  return (
    <main>
      <header className="page-heading">
        <h1>Divertissement</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Tuile href="/marche" titre="Marché" icone={<IconeMarche />}
               detail={<Suspense fallback="Paris de la classe"><Solde userId={u.id} /></Suspense>} />
        <Tuile href="/divertissement/reels" titre="Réels" icone={<IconeReels />}
               detail="Des nombres réels, en vertical" />
        <Tuile href="/divertissement/videos" titre="Vidéos" icone={<IconeVideos />}
               detail="Explications filmées par la classe" />
        <Tuile href="/divertissement/curve-fight" titre="Curve Fight" icone={<IconeCourbes />}
               detail="Duel de fonctions, sans aperçu" />
        <Tuile href="/divertissement/toile" titre="La Toile" icone={<IconeToile />}
               detail="Un pixel toutes les 5 minutes" />
        <Tuile href="/divertissement/quiz" titre="Quiz" icone={<IconeQuiz />}
               detail="QCM de la classe, avec les stats" />
        {toilet && (
          <Tuile href="/toilet" titre="Toilet!" icone={<span className="text-[24px]" aria-hidden="true">🚽</span>}
                 detail="Le classement des toilettes du bas" />
        )}
      </div>
    </main>
  );
}

function Tuile({ href, titre, icone, detail }: {
  href: string; titre: string; icone: React.ReactNode; detail: React.ReactNode;
}) {
  return (
    <Link href={href}
          className="flex min-h-[148px] flex-col justify-between gap-4 rounded-[var(--radius-lg)] border
                     border-[var(--hairline)] bg-[var(--card)] p-4 text-[var(--foreground)]
                     transition-colors hover:bg-[var(--muted)]">
      <span className="grid h-12 w-12 place-items-center rounded-[var(--radius-md)]
                       bg-[var(--secondary)] text-[var(--secondary-foreground)]">
        {icone}
      </span>
      <span>
        <span className="block text-[17px] font-semibold leading-tight">{titre}</span>
        <span className="mt-1 block text-[13px] leading-snug text-[var(--muted-foreground)]">{detail}</span>
      </span>
    </Link>
  );
}

async function Solde({ userId }: { userId: string }) {
  return <>Solde : {formatCentimes(await soldeCentimes(userId))}</>;
}

const trait = {
  viewBox: "0 0 24 24", width: 24, height: 24, fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
};

/* Caméra et tableau : les vidéos éducatives. */
function IconeVideos() {
  return (
    <svg {...trait}>
      <rect x="2.5" y="6" width="13" height="12" rx="3" />
      <path d="m15.5 10.5 6-3.5v10l-6-3.5" />
      <path d="M6 10h6M6 13.5h4" />
    </svg>
  );
}

function IconeMarche() {
  return <svg {...trait}><path d="M5 20V14M12 20V6M19 20v-8" /></svg>;
}

/* Deux courbes qui se croisent dans un repère : Curve Fight. */
function IconeCourbes() {
  return (
    <svg {...trait}>
      <path d="M3 3v18h18" />
      <path d="M5 16c3-9 5-9 7-4s4 5 8-6" />
      <path d="M5 8c4 1 9 4 15 9" />
    </svg>
  );
}

/* Grille de pixels, quelques cases remplies : La Toile. */
function IconeToile() {
  return (
    <svg {...trait}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" strokeOpacity="0.45" />
      <path d="M3.9 3.9h5.1v5.1H3.9zM15 9h5.1v6H15zM9 15h6v5.1H9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* Liste de cases cochées : les quiz. */
function IconeQuiz() {
  return (
    <svg {...trait}>
      <rect x="3" y="4" width="5" height="5" rx="1.5" />
      <path d="m4.3 6.6 1.2 1.1 2-2.4" />
      <rect x="3" y="14" width="5" height="5" rx="1.5" />
      <path d="M11.5 6.5H21M11.5 16.5H21" />
    </svg>
  );
}

/* Clap de cinéma barré d'un ℝ stylisé : réels/reels. */
function IconeReels() {
  return (
    <svg {...trait}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M3 8.5h18M8.5 3l2.5 5.5M14.5 3 17 8.5" />
      <path d="m10.5 12.5 4.5 2.75-4.5 2.75z" />
    </svg>
  );
}
