import Link from "next/link";

/** Flèche de retour en haut à gauche, sans libellé visible. */
export function LienRetour({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label}
          className="-ml-3 -mt-4 mb-4 grid h-11 w-11 place-items-center rounded-full hover:bg-[var(--muted)]">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 6-6 6 6 6" />
      </svg>
    </Link>
  );
}
