import type { Metadata } from "next";
import "@/styles/globals.css";
import Providers from "@/components/Providers";
import AuthGate from "@/components/AuthGate";

export const metadata: Metadata = {
  title: "SatQuery — Autonomous Geospatial Intelligence Platform",
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
    "SatQuery",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
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
