"use client";

import { useRouter } from "next/navigation";

/** Groupe affiché sur la page Colles : change de vue dès la sélection. */
export function ChoixGroupeVue({
  groupe, moi, max, semaine,
}: { groupe: number; moi: number | null; max: number; semaine: string }) {
  const router = useRouter();
  return (
    <select aria-label="Groupe affiché" value={groupe} className="h-11 px-3 text-[14px]"
            onChange={(e) => {
              const g = Number(e.target.value);
              router.push(`/colles?semaine=${semaine}${g === moi ? "" : `&groupe=${g}`}`);
            }}>
      {Array.from({ length: max }, (_, i) => i + 1).map((g) => (
        <option key={g} value={g}>Groupe {g}{g === moi ? " (moi)" : ""}</option>
      ))}
    </select>
  );
}
