import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import SwRegister from "@/components/gis/sw-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GeoKita — GIS Web: Peta, Kontur, Cut & Fill, Ekspor SHP/KMZ",
  description:
    "Aplikasi pemetaan web bergaya ArcGIS/AutoCAD/Surfer: peta OSM & satelit, impor Excel/KML/KMZ hingga 250MB, gambar titik-poligon-teks, ukur jarak, kontur interval bebas, 3D, cut & fill, ekspor KMZ/Excel/SHP, dan layout cetak. Bisa di-install di PC.",
  manifest: "./manifest.json",
  icons: {
    icon: "./icons/icon-192.png",
    apple: "./icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground overflow-hidden`}
      >
        {children}
        <Toaster richColors position="top-center" expand={false} />
        <SwRegister />
      </body>
    </html>
  );
}
