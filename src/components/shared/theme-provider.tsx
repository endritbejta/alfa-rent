"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * `nonce` lets next-themes' inline pre-paint script, and the <style> it adds
 * while switching theme, run under the CSP (src/lib/csp.ts).
 */
export function ThemeProvider({
  children,
  nonce,
}: {
  children: React.ReactNode;
  nonce?: string;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
      storageKey="alfa-theme"
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}
