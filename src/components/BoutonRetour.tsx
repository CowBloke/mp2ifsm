"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { envoyerRetour } from "@/lib/actions-retours";
import { CATEGORIES_RETOUR, type CategorieRetour } from "@/lib/constantes";

/*
 * Bouton « Retour » de la barre du haut, réservé aux membres connectés.
 * Le retour garde l'auteur, la catégorie et la page d'envoi ; son
 * statut se suit dans Profil → Mes retours.
 */
export function BoutonRetour() {
  const chemin = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const [categorie, setCategorie] = useState<CategorieRetour>("idee");
  const [message, setMessage] = useState("");
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const zone = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    zone.current?.focus();
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [ouvert]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setOuvert(true); setEtat(null); }}
        className="flex h-10 items-center gap-1.5 rounded-full border bg-[var(--card)] px-3 text-[13px]
                   font-medium hover:bg-[var(--muted)]"
        aria-haspopup="dialog"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
        Retour
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center"
             style={{ background: "var(--sheet-backdrop)", animation: "fade-in .15s ease-out" }}
             onClick={(e) => { if (e.target === e.currentTarget) setOuvert(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="retour-titre"
               className="w-full max-w-[460px] rounded-[var(--radius-lg)] border bg-[var(--card)] p-4 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <h2 id="retour-titre" className="text-[16px] font-bold">Envoyer un retour</h2>
              <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer"
                      className="-mr-1 -mt-1 rounded-full px-2 py-0.5 text-[18px] text-[var(--muted-foreground)]
                                 hover:bg-[var(--muted)]">×</button>
            </div>

            {etat?.ok ? (
              <div className="mt-3">
                <p role="status" className="text-[14px]">{etat.texte}</p>
                <Link href="/profil#mes-retours" onClick={() => setOuvert(false)}
                      className="mt-3 inline-block text-[13px] font-medium text-[var(--primary)]">
                  Suivre mes retours →
                </Link>
              </div>
            ) : (
              <form
                className="mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  setEtat(null);
                  demarrer(async () => {
                    const r = await envoyerRetour(categorie, message, chemin);
                    if (r.ok) {
                      setMessage("");
                      setEtat({ ok: true, texte: "Merci ! Les administrateurs verront votre retour ; son statut apparaît dans votre profil." });
                    } else {
                      setEtat({ ok: false, texte: r.erreur });
                    }
                  });
                }}
              >
                <fieldset>
                  <legend className="sr-only">Catégorie</legend>
                  <div className="flex gap-2">
                    {CATEGORIES_RETOUR.map((c) => (
                      <label key={c.cle}
                             className={`flex-1 cursor-pointer rounded-[var(--radius-md)] border py-2 text-center
                                         text-[13px] font-medium transition-colors ${
                                           categorie === c.cle
                                             ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                                             : "hover:bg-[var(--muted)]"
                                         }`}>
                        <input type="radio" name="categorie" value={c.cle} className="sr-only"
                               checked={categorie === c.cle} onChange={() => setCategorie(c.cle)} />
                        {c.nom}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <textarea
                  ref={zone}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required minLength={5} maxLength={2000} rows={5}
                  aria-label="Message"
                  placeholder={categorie === "bug"
                    ? "Ce qui s’est passé, ce que vous attendiez, et comment le reproduire…"
                    : "Votre suggestion…"}
                  className="w-full rounded-[var(--radius-md)] border-2 px-3 py-2 text-[14px]
                             outline-none focus:border-[var(--ring)]"
                />
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Envoyé avec votre nom et la page actuelle ({chemin}).
                </p>
                {etat && !etat.ok && (
                  <p role="alert" className="text-[13px] font-medium text-[var(--destructive)]">{etat.texte}</p>
                )}
                <button type="submit" disabled={enCours || message.trim().length < 5}
                        className="w-full rounded-[var(--radius-md)] bg-[var(--primary)] py-2.5 text-[14px]
                                   font-semibold text-[var(--primary-foreground)] disabled:opacity-40">
                  {enCours ? "Envoi…" : "Envoyer"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
