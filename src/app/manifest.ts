import type { MetadataRoute } from "next";

/* Web app installable : nécessaire aux notifications sur iPhone/iPad. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "MP2I/FSM — Portail de classe",
    short_name: "MP2I/FSM",
    description: "Fiches, colles, documents et échéances de la classe MP2I/FSM.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#18181b",
    theme_color: "#18181b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
