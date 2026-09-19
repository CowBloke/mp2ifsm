/** Couleur stable par rang d'issue (cycle au-dela de 4). */
export function couleurIssue(index: number): string {
  return `var(--outcome-${(index % 4) + 1})`;
}
