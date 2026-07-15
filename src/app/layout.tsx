import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Alfa Rent a Car",
    template: "%s | Alfa Rent a Car",
  },
  description:
    "Premium car rental in Kosovo. Drive premium, travel without limits.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
      style={
        {
          "--font-sans": "var(--font-geist-sans)",
          "--font-display": "var(--font-outfit)",
        } as React.CSSProperties
      }
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
