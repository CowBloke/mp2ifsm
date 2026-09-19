import Link from "next/link";

export default function Introuvable() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center text-center">
      <p className="text-[42px] font-bold leading-none">404</p>
      <h1 className="mt-2 text-[16px] font-semibold">Page introuvable</h1>
      <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
        Ce marché n’existe pas ou a été supprimé.
      </p>
      <Link
        href="/"
        className="mt-5 rounded-[var(--radius-md)] bg-[var(--primary)] px-5 py-3 text-[14px]
                   font-semibold text-[var(--primary-foreground)]"
      >
        Retour aux marchés
      </Link>
    </main>
  );
}
