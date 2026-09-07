import type { Metadata } from "next";
import { Inter, Press_Start_2P, Playfair_Display } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const serifFont = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
});

const pixelFont = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-pixel",
});

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
    <html lang="en" className={`${inter.variable} ${serifFont.variable} ${pixelFont.variable}`}>
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛰️</text></svg>"
        />
      </head>
      <body>
        <div className="theme-epic-backdrop" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
