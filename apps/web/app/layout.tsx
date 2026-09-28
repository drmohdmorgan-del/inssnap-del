import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#0a0a2e",
};

export const metadata: Metadata = {
  title: "INSSNAPP — Resident-Powered Leasing Infrastructure",
  description: "The Missing Tile in real-time occupied-unit showing coordination.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "INSSNAPP — Resident-Powered Leasing Infrastructure",
    description: "The Missing Tile in real-time occupied-unit showing coordination.",
    images: ["/opengraph-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "INSSNAPP — Resident-Powered Leasing Infrastructure",
    description: "The Missing Tile in real-time occupied-unit showing coordination.",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
