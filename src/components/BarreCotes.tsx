import { couleurIssue } from "./couleurs";
import { formatPourcentage } from "@/lib/money";

/*
 * Cotes implicites : la largeur de chaque segment EST la part de la
 * cagnotte misee sur l'issue. C'est la lecture la plus directe possible
 * d'un marche parimutuel — pas de cote decimale a interpreter.
 */
export function BarreCotes({
  parts,
  labels,
  compacte = false,
}: {
  parts: number[];
  labels: string[];
  compacte?: boolean;
}) {
  const total = parts.reduce((a, b) => a + b, 0) || 1;

  return (
    <div>
      <div
        className={`flex w-full overflow-hidden rounded-full bg-[var(--muted)] ${
          compacte ? "h-2" : "h-2.5"
        }`}
        role="img"
        aria-label={labels
          .map((l, i) => `${l} ${formatPourcentage(parts[i] / total)}`)
          .join(", ")}
      >
        {parts.map((p, i) => (
          <div
            key={i}
            className="h-full transition-[width] duration-500 ease-out"
            style={{
              width: `${(p / total) * 100}%`,
              background: couleurIssue(i),
              // Un filet clair evite que deux segments voisins se confondent.
              boxShadow: i > 0 ? "inset 1px 0 0 var(--card)" : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}
