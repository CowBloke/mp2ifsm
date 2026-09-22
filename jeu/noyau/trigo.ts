/*
 * Cosinus et sinus en millièmes, par degré entier.
 *
 * La table est calculée une fois ; l'arrondi à l'entier absorbe les
 * infimes écarts de Math.cos entre moteurs JavaScript, si bien que le
 * serveur et tous les navigateurs obtiennent les mêmes reculs.
 */

const COS: number[] = [];
// « + 0 » : Math.round rend -0 pour de minuscules valeurs négatives.
for (let d = 0; d < 360; d++) COS.push(Math.round(Math.cos((d * Math.PI) / 180) * 1000) + 0);

function indice(degres: number): number {
  return ((Math.round(degres) % 360) + 360) % 360;
}

export function cosDeg(degres: number): number {
  return COS[indice(degres)];
}

export function sinDeg(degres: number): number {
  return COS[indice(degres - 90)];
}
