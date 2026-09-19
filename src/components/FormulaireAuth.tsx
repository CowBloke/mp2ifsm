"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { connexion, inscription } from "@/lib/actions";

/*
 * Connexion et inscription partagent la meme mise en page. En cas de
 * succes l'action serveur redirige ; on n'affiche donc que les erreurs.
 */
export function FormulaireAuth({ mode }: { mode: "connexion" | "inscription" }) {
  const action = mode === "connexion" ? connexion : inscription;
  const [etat, envoyer] = useActionState(action, null);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[400px] flex-col justify-center py-10">
      <div className="mb-7 text-center">
        <h1 className="text-[26px] font-bold leading-tight">MP2I/FSM</h1>
      </div>

      <form action={envoyer} className="space-y-3">
        {mode === "inscription" && (
          <Champ nom="pseudo" label="Pseudo" autoComplete="nickname" />
        )}
        <Champ nom="email" label="Email" type="email" autoComplete="email" />
        <Champ
          nom="motDePasse"
          label="Mot de passe"
          type="password"
          autoComplete={mode === "connexion" ? "current-password" : "new-password"}
        />
        {mode === "inscription" && (
          <Champ nom="code" label="Code d’invitation de la classe" autoComplete="off" />
        )}

        {etat && !etat.ok && (
          <p
            role="alert"
            className="rounded-[var(--radius-md)] bg-[var(--destructive)]/10 px-3 py-2
                       text-[13px] font-medium text-[var(--destructive)]"
          >
            {etat.erreur}
          </p>
        )}

        <BoutonEnvoyer label={mode === "connexion" ? "Se connecter" : "Créer mon compte"} />
      </form>

      <p className="mt-5 text-center text-[13px] text-[var(--muted-foreground)]">
        {mode === "connexion" ? (
          <>
            Pas encore de compte ?{" "}
            <Link href="/inscription" className="font-medium text-[var(--primary)] underline">
              S’inscrire
            </Link>
          </>
        ) : (
          <>
            Déjà inscrit ?{" "}
            <Link href="/connexion" className="font-medium text-[var(--primary)] underline">
              Se connecter
            </Link>
          </>
        )}
      </p>

    </main>
  );
}

function Champ({
  nom, label, type = "text", autoComplete,
}: {
  nom: string; label: string; type?: string; autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={nom} className="text-[13px] font-medium">{label}</label>
      <input
        id={nom}
        name={nom}
        type={type}
        autoComplete={autoComplete}
        required
        className="mt-1 w-full rounded-[var(--radius-md)] border-2 bg-[var(--background)] px-3 py-2.5
                   text-[15px] outline-none focus:border-[var(--ring)]"
      />
    </div>
  );
}

function BoutonEnvoyer({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-3.5 text-[15px]
                 font-semibold text-[var(--primary-foreground)] disabled:opacity-50"
    >
      {pending ? "…" : label}
    </button>
  );
}
