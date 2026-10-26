/** Icône de dossier, partagée par les pages Documents et Fiches. */
export function IconeDossier({ taille = 18 }: { taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2.5h8.5A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
    </svg>
  );
}
