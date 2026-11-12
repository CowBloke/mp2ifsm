import Link from "next/link";
import { JEUX, type CleJeu } from "./jeux";

/*
 * En-tête d'une rubrique du Divertissement : le cube de couleur du jeu,
 * son icône et son titre. Remplace LienRetour + page-heading sur ces
 * pages, qui ont chacune leur propre identité.
 */
export function EnTeteJeu({ jeu, titre, retour, children, action }: {
  jeu: CleJeu;
  /** Par défaut le nom du jeu ; pour une sous-page (« Classement »…). */
  titre?: string;
  retour?: { href: string; label: string };
  children?: React.ReactNode;
  /** Élément placé en haut à droite (solde, lien…). */
  action?: React.ReactNode;
}) {
  const { nom, Icone } = JEUX[jeu];
  const r = retour ?? { href: "/divertissement", label: "Retour au divertissement" };
  return (
    <header className="jeu-entete">
      <div className="jeu-entete__haut">
        <Link href={r.href} aria-label={r.label} className="jeu-entete__retour">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </Link>
        {action}
      </div>
      <div className="jeu-entete__corps">
        <Icone />
        <div className="min-w-0">
          {titre && <p className="jeu-entete__sur">{nom}</p>}
          <h1 className="jeu-titre">{titre ?? nom}</h1>
        </div>
      </div>
      {children && <div className="jeu-entete__texte">{children}</div>}
    </header>
  );
}
