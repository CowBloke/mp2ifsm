import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { SuiviMontage } from "@/components/videos/SuiviMontage";
import { formatCompte } from "@/lib/reels";
import { utilisateurCourant } from "@/lib/session";
import { listerVideos, mesVideosEnCours, profilVideos } from "@/lib/videos";
import { formatDuree } from "@/lib/videos-montage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profil — Vidéos — MP2I/FSM" };

/* Profil d'un membre : toutes ses vidéos ; « moi » désigne le membre connecté. */
export default async function PageProfil({ params }: { params: Promise<{ id: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const brut = (await params).id;
  const id = brut === "moi" ? u.id : brut;
  const profil = await profilVideos(id);
  if (!profil) notFound();
  const moi = profil.id === u.id;
  const [videos, enCours] = await Promise.all([listerVideos(u.id, { auteur: profil.id }), moi ? mesVideosEnCours(u.id) : []]);

  return (
    <main>
      <LienRetour href="/divertissement/videos" label="Retour au fil des vidéos" />
      <header className="mb-6 flex flex-col items-center text-center">
        <span className="reels__avatar videos__avatar-profil" aria-hidden="true">{profil.pseudo[0]?.toUpperCase()}</span>
        <h1 className="mt-3 text-[24px] font-semibold tracking-tight">{profil.pseudo}</h1>
        <dl className="mt-3 flex gap-8 text-[13px] text-[var(--muted-foreground)]">
          {([["vidéo", profil.videos], ["j’aime", profil.likes], ["vue", profil.vues]] as const).map(([l, n]) => (
            <div key={l} className="flex flex-col items-center">
              <dt className="order-2">{l}{n > 1 && l !== "j’aime" ? "s" : ""}</dt>
              <dd className="text-[18px] font-semibold tabular text-[var(--foreground)]">{formatCompte(n)}</dd>
            </div>
          ))}
        </dl>
        {moi && (
          <Link href="/divertissement/videos/nouvelle"
                className="bouton-principal bouton-sombre mt-5 inline-flex h-11 items-center gap-2 px-5">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Nouvelle vidéo
          </Link>
        )}
      </header>

      {enCours.length > 0 && <SuiviMontage videos={enCours} />}

      {videos.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-8 text-center text-[14px] text-[var(--muted-foreground)]">
          {moi ? "Vous n’avez pas encore publié de vidéo." : `${profil.pseudo} n’a pas encore publié de vidéo.`}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-1">
          {videos.map((v) => (
            <li key={v.id}>
              <Link href={`/divertissement/videos/${v.id}?auteur=${profil.id}`} className="videos__vignette videos__vignette--grille">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/videos/${v.id}?couverture=1`} alt="" loading="lazy" />
                <span className="videos__duree tabular">{formatDuree(v.duree_ms / 1000)}</span>
                <span className="videos__legende">
                  <span className="line-clamp-2 text-[12px] font-semibold leading-snug">{v.titre}</span>
                  <span className="mt-0.5 block text-[11px] tabular opacity-90">♥ {formatCompte(v.likes)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
