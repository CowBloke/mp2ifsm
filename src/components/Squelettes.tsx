/*
 * Etats de chargement. Ils reprennent exactement la geometrie du
 * contenu reel pour que rien ne saute quand les donnees arrivent.
 */

export function SqueletteCarte() {
  return (
    <div className="rounded-[var(--radius-lg)] border bg-[var(--card)] p-4">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton mt-3 h-5 w-full" />
      <div className="skeleton mt-2 h-5 w-3/5" />
      <div className="skeleton mt-4 h-2.5 w-full rounded-full" />
      <div className="mt-3 flex gap-2">
        <div className="skeleton h-9 flex-1" />
        <div className="skeleton h-9 flex-1" />
      </div>
    </div>
  );
}

export function SqueletteFil() {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Chargement des marchés…</span>
      {Array.from({ length: 4 }).map((_, i) => (
        <SqueletteCarte key={i} />
      ))}
    </div>
  );
}

export function SqueletteLigne({ largeur = "w-full" }: { largeur?: string }) {
  return <div className={`skeleton h-12 ${largeur}`} />;
}

export function SqueletteListe({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <SqueletteLigne key={i} />
      ))}
    </div>
  );
}

export function SquelettePortefeuille() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="rounded-[var(--radius-lg)] border bg-[var(--card)] p-5">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton mt-3 h-9 w-40" />
        <div className="mt-4 flex gap-2">
          <div className="skeleton h-10 flex-1" />
          <div className="skeleton h-10 flex-1" />
        </div>
      </div>
      <SqueletteListe n={4} />
    </div>
  );
}
