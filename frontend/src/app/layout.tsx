import type { Metadata } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const pixelFont = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-pixel",
});

export const metadata: Metadata = {
  title: "SatQuery AI — Interactive Remote Sensing Analysis",
  description:
    "An interactive Vision-Language assistant for multimodal remote sensing image analysis through text queries. SIH Problem Statement 26167.",
  keywords: [
    "satellite imagery",
    "remote sensing",
    "VLM",
    "GIS",
    "object detection",
    "NDVI",
    "SIH",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${pixelFont.variable}`}>
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛰️</text></svg>"
        />
      </head>
      <body>
        <div className="ambient-bg" aria-hidden="true">
          <div className="ambient-bg__blob ambient-bg__blob--1" />
          <div className="ambient-bg__blob ambient-bg__blob--2" />
          <div className="ambient-bg__blob ambient-bg__blob--3" />
          <div className="ambient-bg__pixel-star" style={{ top: "14%", left: "22%", animationDelay: "0s" }} />
          <div className="ambient-bg__pixel-star" style={{ top: "28%", left: "68%", animationDelay: "0.6s" }} />
          <div className="ambient-bg__pixel-star" style={{ top: "62%", left: "40%", animationDelay: "1.2s" }} />
          <div className="ambient-bg__pixel-star" style={{ top: "45%", left: "85%", animationDelay: "1.8s" }} />
          <div className="ambient-bg__pixel-star" style={{ top: "78%", left: "12%", animationDelay: "0.9s" }} />
        </div>
        {children}
      </body>
    </html>
  );
}
