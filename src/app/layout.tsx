import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { LocaleProvider } from "@/components/shared/locale-provider";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

/**
 * One family, used across its whole weight range.
 *
 * Outfit carried the display role until now — a geometric grotesk with soft,
 * wide digits, which is the wrong voice for a screen where money and plates
 * sit in columns. Geist has a real display range and true tabular figures,
 * and it was already being downloaded for body text. Two families at one
 * weight each read cheaper than one family used with range.
 *
 * --font-display stays as the indirection, so every `font-display` class in
 * the app keeps working and no component had to change.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: {
      default: "Alfa Rent a Car",
      template: "%s | Alfa Rent a Car",
    },
    description: t("home.metaDescription"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, dictionary } = await getI18n();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={
        {
          "--font-sans": "var(--font-geist-sans)",
          "--font-display": "var(--font-geist-sans)",
        } as React.CSSProperties
      }
    >
      <body className="flex min-h-full flex-col">
        <LocaleProvider locale={locale} dictionary={dictionary}>
          <ThemeProvider>
            <div className="ambient-background">
              <div className="ambient-light"></div>
            </div>
            {children}
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
