/* Shared static dashboard assets must restore the palette before first paint. */
/* eslint-disable @next/next/no-sync-scripts, @next/next/no-css-tags */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codex Usage Mesh",
  description: "Dashboard privé d’usage Codex multi-machine.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr" suppressHydrationWarning><head><link rel="stylesheet" href="/dashboard/palettes.css" /><script src="/dashboard/themes.js" /><script src="/dashboard/theme-sync.js" defer /></head><body>{children}</body></html>;
}
