import Link from "next/link";

export default function Introuvable() {
  return (
    <main className="flex min-h-[60dvh] flex-col justify-center gap-8">
      <div>
        <h1 className="titre-page">Page introuvable</h1>
        <p className="mt-3 text-[17px] text-[var(--muted-foreground)]">
          Cette page n’existe pas ou a été supprimée.
        </p>
      </div>
      <Link href="/" className="bouton-principal">Retour à l’accueil</Link>
    </main>
  );
}
