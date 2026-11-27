import type { MetadataRoute } from "next";

/**
 * Web app manifest (Step 7.3). One manifest serves both roles: the start page is the main menu,
 * which shows a learner device only the learner area and a guardian both.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "OpenIGCSE",
    short_name: "OpenIGCSE",
    description: "Homeschool study workspace for Cambridge IGCSE, with a parent area for planning, marking and monitoring.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#faf7f0",
    theme_color: "#faf7f0",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", url: "/today", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Live (parent)", url: "/parent/live", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
