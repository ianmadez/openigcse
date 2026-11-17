import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "OpenIGCSE - Homeschooling for Cambridge IGCSE",
    template: "%s - OpenIGCSE",
  },
  description:
    "A calm, focus-first IGCSE workspace: Cambridge-aligned topics, sandboxed lessons, spaced-repetition checkpoints and parent-controlled focus sessions.",
  applicationName: "OpenIGCSE",
};

export const viewport: Viewport = {
  themeColor: "#faf7f0",
  width: "device-width",
  initialScale: 1,
};

const themeBootstrap = `
(function () {
  try {
    // Light is the default; dark applies only when the learner opts in.
    var isDark = localStorage.getItem("openigcse-theme") === "dark";
    document.documentElement.classList.toggle("dark", isDark);
  } catch (error) {
    /* localStorage can be blocked; fall back to the light palette. */
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
