import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AETERNA OS",
    short_name: "AETERNA",
    description: "Il centro operativo di AETERNA.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#171716",
    lang: "it",
    icons: [
      { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
