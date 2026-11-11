import type { LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { LanguageSelector } from "@/components/shared/language-selector";
import { Card } from "@/components/ui/card";

/**
 * The frame for the staff pages that sit outside the admin shell: signing in,
 * and choosing a password. A brand panel on wide screens, the task itself on
 * the right, and the language switch in the corner because neither page has
 * a sidebar to put it in.
 *
 * `asideTitleAs` exists because the panel is hidden on phones. Sign-in keeps
 * its long-standing h1 there; a page whose real heading is in the card makes
 * the panel's a paragraph, so there is exactly one h1 at every width.
 */
export function AuthFrame({
  icon: Icon,
  asideTitle,
  asideBody,
  asideTitleAs: AsideTitle = "h1",
  children,
}: {
  icon: LucideIcon;
  asideTitle: string;
  asideBody: string;
  asideTitleAs?: "h1" | "p";
  children: React.ReactNode;
}) {
  return (
    <main className="bg-band text-band-foreground relative flex min-h-screen items-center justify-center overflow-hidden p-5">
      <LanguageSelector className="text-band-muted absolute top-5 right-5" />
      <div className="bg-card text-card-foreground grid w-full max-w-4xl overflow-hidden rounded-none shadow-lg md:grid-cols-[1.05fr_.95fr]">
        <section className="bg-sidebar text-sidebar-foreground relative hidden min-h-[34rem] flex-col justify-between overflow-hidden p-10 md:flex">
          <div
            aria-hidden="true"
            className="bg-brand/15 absolute -top-32 -left-32 h-80 w-80 rounded-none blur-3xl"
          />
          <BrandLogo className="relative text-xl" preload />
          <div className="relative">
            <span className="bg-sidebar-accent text-sidebar-accent-foreground mb-6 flex h-12 w-12 items-center justify-center rounded-none">
              <Icon className="h-6 w-6" />
            </span>
            <AsideTitle className="font-display max-w-sm text-3xl leading-tight font-bold">
              {asideTitle}
            </AsideTitle>
            <p className="text-sidebar-foreground/65 mt-4 max-w-sm text-sm leading-relaxed">
              {asideBody}
            </p>
          </div>
          <p className="text-sidebar-foreground/45 text-xs">
            Alfa Rent · {new Date().getFullYear()}
          </p>
        </section>

        <Card className="flex min-h-[34rem] flex-col justify-center rounded-none border-0 p-2 shadow-none">
          {children}
        </Card>
      </div>
    </main>
  );
}
