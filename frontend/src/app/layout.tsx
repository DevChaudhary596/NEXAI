import type { Metadata } from "next";
import "@/styles/globals.css";
import Providers from "@/components/Providers";
import AuthGate from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "SOLEN — Autonomous Geospatial Intelligence Platform",
  description:
    "Enterprise-grade autonomous geospatial intelligence and remote sensing platform. Real-time planetary observation, automated computer vision, and spectral analytics.",
  keywords: [
    "satellite imagery",
    "remote sensing",
    "geospatial intelligence",
    "earth observation",
    "GIS",
    "object detection",
    "NDVI",
    "SOLEN",
  ],
  icons: {
    icon: [
      { url: "/icon.png?v=solen", type: "image/png", sizes: "256x256" },
      { url: "/images/solen_app_icon.png?v=solen", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico?v=solen", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=solen",
    apple: [
      { url: "/apple-icon.png?v=solen", sizes: "256x256", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" sizes="256x256" href="/icon.png?v=solen" />
        <link rel="icon" type="image/png" sizes="32x32" href="/images/solen_app_icon.png?v=solen" />
        <link rel="shortcut icon" href="/favicon.ico?v=solen" />
        <link rel="apple-touch-icon" href="/apple-icon.png?v=solen" />
      </head>
      <body>
        <a href="#main-operations" className="skip-to-content">
          Skip to main operations
        </a>
        <div className="theme-epic-backdrop" aria-hidden="true" />
        <Providers><AuthGate>{children}</AuthGate></Providers>
      </body>
    </html>
  );
}
