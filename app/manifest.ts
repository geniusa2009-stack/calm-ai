import type { MetadataRoute } from "next";

/** Web app manifest (served at /manifest.webmanifest). Colours are the original Calm palette. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Calm",
    short_name: "Calm",
    description: "Personal wellbeing intelligence. Not a medical device.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f6f4ef",
    theme_color: "#f6f4ef",
    categories: ["health", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
