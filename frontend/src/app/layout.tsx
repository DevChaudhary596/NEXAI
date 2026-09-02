import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
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
    <html lang="en" className={inter.variable}>
      <head>
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛰️</text></svg>"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
