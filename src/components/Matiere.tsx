import type { CSSProperties } from "react";
import { couleurMatiere } from "@/lib/constantes";

/*
 * Une seule façon d'afficher une matière sur tout le site : la couleur
 * est posée dans --m, et les classes .m-* de globals.css en dérivent
 * texte, teinte de fond, bordure et liseré.
 */
export function styleMatiere(couleur: string | null | undefined): CSSProperties {
  return { "--m": couleurMatiere(couleur) } as CSSProperties;
}

/** Pastille « ● Physique ». Sans matière : pastille neutre. */
export function PastilleMatiere({
  nom, couleur, petite = false, className = "",
}: {
  nom: string | null;
  couleur: string | null;
  petite?: boolean;
  className?: string;
}) {
  return (
    <span
      style={styleMatiere(couleur)}
      className={`m-teinte m-texte inline-flex max-w-full items-center gap-1 rounded-full
                  font-semibold ${petite ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}
                  ${className}`}
    >
      <span className="m-plein h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
      <span className="truncate">{nom ?? "Sans matière"}</span>
    </span>
  );
}

/** Menu déroulant de matière pour les formulaires de création. */
export function ChoixMatiere({
  matieres, defaut = "", className = "",
}: {
  matieres: Array<{ id: number; nom: string }>;
  defaut?: string;
  className?: string;
}) {
  return (
    <select
      name="matiere" defaultValue={defaut} aria-label="Matière"
      className={`rounded-[var(--radius-md)] border-2 px-2 py-2 text-[14px] outline-none
                  focus:border-[var(--ring)] ${className}`}
    >
      <option value="">Sans matière</option>
      {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
    </select>
  );
}
