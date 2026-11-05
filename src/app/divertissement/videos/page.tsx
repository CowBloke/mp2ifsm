import Link from "next/link";
import { redirect } from "next/navigation";
import { LienRetour } from "@/components/LienRetour";
import { PastilleMatiere } from "@/components/Matiere";
import { SuiviMontage } from "@/components/videos/SuiviMontage";
import { listerMatieres } from "@/lib/matieres";
import { utilisateurCourant } from "@/lib/session";
import { listerVideos, mesVideosEnCours } from "@/lib/videos";
import { formatDuree } from "@/lib/videos-montage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vidéos éducatives — MP2I/FSM" };

/* Galerie des vidéos de la classe ; on ouvre le fil vertical depuis une vignette. */
export default async function PageVideos({ searchParams }: { searchParams: Promise<{ matiere?: string }> }) {
  const u = await utilisateurCourant();
  if (!u) redirect("/connexion");
  const brut = Number((await searchParams).matiere);
  const matiere = Number.isSafeInteger(brut) && brut > 0 ? brut : null;
  const [videos, enCours, matieres] = await Promise.all([
    listerVideos(u.id, matiere), mesVideosEnCours(u.id), listerMatieres(),
  ]);

  return (
    <main>
      <LienRetour href="/divertissement" label="Retour au divertissement" />
      <header className="page-heading">
        <h1>Vidéos</h1>
        <Link href="/divertissement/videos/nouvelle" className="bouton-principal bouton-sombre inline-flex h-11 items-center gap-2 px-4">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor" /><circle cx="12" cy="12" r="9" /></svg>
          Enregistrer
        </Link>
        <p>Expliquez une notion à la classe : filmez-vous dans l’app, montez, publiez.</p>
      </header>

      {enCours.length > 0 && <SuiviMontage videos={enCours} />}

      <nav aria-label="Filtrer par matière" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href="/divertissement/videos" className="puce shrink-0" aria-current={matiere === null ? "page" : undefined}>Toutes</Link>
        {matieres.map((m) => (
          <Link key={m.id} href={`/divertissement/videos?matiere=${m.id}`} className="puce shrink-0"
                aria-current={matiere === m.id ? "page" : undefined}>{m.nom}</Link>
        ))}
      </nav>

      {videos.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] p-8 text-center">
          <p className="font-semibold">Aucune vidéo{matiere ? " dans cette matière" : ""} pour l’instant</p>
          <p className="mt-1 text-[14px] text-[var(--muted-foreground)]">
            Une démo, une méthode, un exercice corrigé : lancez la première.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {videos.map((v) => (
            <li key={v.id}>
              <Link href={`/divertissement/videos/${v.id}${matiere ? `?matiere=${matiere}` : ""}`} className="videos__vignette">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/videos/${v.id}?couverture=1`} alt="" loading="lazy" />
                <span className="videos__duree tabular">{formatDuree(v.duree_ms / 1000)}</span>
                <span className="videos__legende">
                  <span className="line-clamp-2 text-[14px] font-semibold leading-snug">{v.titre}</span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-[12px] opacity-90">
                    <span className="truncate">{v.auteur}</span>
                    <span className="shrink-0 tabular">♥ {v.likes}</span>
                  </span>
                </span>
              </Link>
              {v.matiere && <PastilleMatiere nom={v.matiere} couleur={v.couleur} petite className="mt-1 px-1" />}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
