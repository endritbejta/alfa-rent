"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LanguageSelector } from "@/components/shared/language-selector";
import { useI18n } from "@/components/shared/locale-provider";
import { BrandLogo } from "@/components/shared/brand-logo";
import type { TranslationKey } from "@/lib/i18n/translations";

const NAV = [
  { href: "/", label: "nav.home" },
  { href: "/car", label: "nav.vehicles" },
  { href: "/contact", label: "nav.contact" },
] satisfies { href: string; label: TranslationKey }[];

/**
 * "Book" goes to the fleet: /booking needs a car and redirects there without
 * one, so linking it directly only added a redirect to every click.
 */
const BOOK_HREF = "/car";

export function SiteHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="bg-band text-band-foreground border-band-border sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="Alfa Rent">
          <BrandLogo className="text-lg" preload />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "px-4 py-2 text-sm transition-colors",
                  active
                    ? "text-band-foreground font-semibold"
                    : "text-band-muted hover:text-band-foreground"
                )}
              >
                {t(item.label)}
                {active && (
                  <span className="bg-brand mx-auto mt-0.5 block h-px w-5" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <LanguageSelector compact />
          <ThemeToggle />
          <Button nativeButton={false} render={<Link href={BOOK_HREF} />}>
            {t("common.bookNow")}
          </Button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <LanguageSelector compact />
          <ThemeToggle />
          <button
            type="button"
            className="text-band-foreground hover:bg-band-border/60 -mr-2 flex h-11 w-11 items-center justify-center rounded-none transition-colors"
            aria-label={open ? t("header.closeMenu") : t("header.openMenu")}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          className="border-band-border border-t px-5 py-4 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-lg px-3 text-sm transition-colors",
                    active
                      ? "bg-band-border/60 text-band-foreground font-semibold"
                      : "text-band-muted hover:text-band-foreground"
                  )}
                >
                  {t(item.label)}
                </Link>
              );
            })}
            <Button
              className="mt-2 w-full"
              nativeButton={false}
              render={<Link href={BOOK_HREF} onClick={() => setOpen(false)} />}
            >
              {t("common.bookNow")}
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
