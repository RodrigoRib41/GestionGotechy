import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
const brandIcon = "/logo.jpg";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Gotechy Consulting",
    template: "%s | Gotechy Consulting"
  },
  description: "Plataforma interna para registro de tiempo, proyectos y metricas ejecutivas.",
  icons: {
    icon: [{ url: brandIcon, type: "image/jpeg", sizes: "720x758" }],
    shortcut: [{ url: brandIcon, type: "image/jpeg", sizes: "720x758" }],
    apple: [{ url: brandIcon, type: "image/jpeg", sizes: "180x180" }]
  },
  openGraph: {
    title: "Gotechy Consulting",
    description: "Plataforma interna para registro de tiempo, proyectos y metricas ejecutivas.",
    images: [{ url: brandIcon, width: 720, height: 758 }]
  }
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" }
  ]
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
