import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codex Usage Mesh",
  description: "Dashboard privé d’usage Codex multi-machine.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
