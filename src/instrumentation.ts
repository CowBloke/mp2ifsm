/*
 * Démarrage du serveur Next.js : lance le planificateur des
 * notifications (flash du jour, rappels de devoirs) et la file de rendu
 * des vidéos dans le processus Node. Rien ne tourne pendant
 * `next build`, ni dans le runtime edge.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { demarrerPlanificateur } = await import("./lib/notifications");
  demarrerPlanificateur();
  if (process.env.MP2_VIDEOS !== "off") {
    const { demarrerRendus } = await import("./lib/videos-rendu");
    demarrerRendus();
  }
}
