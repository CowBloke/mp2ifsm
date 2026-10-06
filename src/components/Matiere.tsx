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
      className={`inline-flex max-w-full items-center gap-1.5 font-medium text-[var(--muted-foreground)]
                  ${petite ? "text-[11px]" : "text-[13px]"} ${className}`}
    >
      <span className="m-plein h-2 w-2 shrink-0 rounded-full" aria-hidden />
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
      className={`min-h-12 px-3 ${className}`}
    >
      <option value="">Sans matière</option>
      {matieres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
    </select>
  );
}
