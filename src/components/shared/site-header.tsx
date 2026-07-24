"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/car", label: "Vehicles" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-band text-band-foreground border-band-border sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight"
        >
          ALFA <span className="text-brand">RENT</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition-colors",
                  active
                    ? "text-band-foreground font-semibold"
                    : "text-band-muted hover:text-band-foreground"
                )}
              >
                {item.label}
                {active && (
                  <span className="bg-brand mx-auto mt-0.5 block h-0.5 w-5 rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Button nativeButton={false} render={<Link href="/booking" />}>
            Book now
          </Button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="text-band-foreground"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-band-border border-t px-5 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-band-muted hover:text-band-foreground rounded-lg px-2 py-2.5 text-sm"
              >
                {item.label}
              </Link>
            ))}
            <Button
              className="mt-2 w-full"
              nativeButton={false}
              render={<Link href="/booking" onClick={() => setOpen(false)} />}
            >
              Book now
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
