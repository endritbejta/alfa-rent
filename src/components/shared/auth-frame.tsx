import Image from "next/image";
import { BrandLogo, BrandMark } from "@/components/shared/brand-logo";
import { LanguageSelector } from "@/components/shared/language-selector";

/**
 * The frame for the staff pages that sit outside the admin shell: signing in,
 * and choosing a password. A headline over the taillight photo on the left,
 * the task in a card on the right, and the language switch in the top bar
 * because neither page has a sidebar to put it in.
 *
 * Always dark, whatever the visitor's theme: the `dark` class on the root
 * swaps every token below it, so the card, inputs and button pick up the
 * charcoal palette (and its AA-checked red) without a second set of colours.
 *
 * Exactly one h1 per page. Sign-in's h1 is the headline; a page whose real
 * heading is the card's says so with `headlineAs="p"` and `titleAs="h1"`.
 */
export function AuthFrame({
  eyebrow,
  headline,
  headlineAccent,
  subline,
  headlineAs: Headline = "h1",
  title,
  titleAs: Title = "h2",
  description,
  children,
}: {
  eyebrow: string;
  headline: string;
  /** A second headline line, in the accent red. */
  headlineAccent?: string;
  subline: string;
  headlineAs?: "h1" | "p";
  title: string;
  titleAs?: "h1" | "h2";
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="dark bg-band text-foreground relative isolate flex min-h-dvh flex-col overflow-x-hidden">
      {/* The dark-red glow at the edges. Static, so nothing for
          reduced-motion to switch off. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_100%_0%,rgb(220_32_40/0.10),transparent),radial-gradient(50%_60%_at_0%_100%,rgb(220_32_40/0.12),transparent)]"
      />

      {/* The photo. Below lg, a dimmed band pulled up so the taillight
          glows behind the top bar and has faded out before the headline —
          a red line of text over a red light would lose its contrast. From
          lg it sits bottom-left under the headline column and bleeds off
          the edge, faded on top and right into the page. One element at
          every width, so the preload is never for an image the viewport
          does not show. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-28 -z-10 h-72 mask-b-from-45% mask-b-to-100% opacity-50 lg:top-auto lg:right-auto lg:bottom-0 lg:h-[62%] lg:w-[58%] lg:mask-t-from-45% lg:mask-t-to-100% lg:mask-r-from-55% lg:mask-r-to-100% lg:mask-b-from-100% lg:opacity-80"
      >
        <Image
          src="/images/login-car.jpg"
          alt=""
          fill
          // Local file: the project's loader only resizes Cloudinary URLs,
          // so there is no srcset to choose from. The JPEG is already cut
          // to 1440px for this slot.
          unoptimized
          preload
          className="object-cover object-[40%_60%] lg:object-[30%_60%]"
        />
      </div>

      <header className="border-band-border border-b">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <BrandLogo className="text-xl" preload />
          <LanguageSelector
            compact
            className="text-band-foreground h-11 border-white/20 bg-black/30 px-3"
          />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 content-start gap-10 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[1.15fr_1fr] lg:content-center lg:items-center lg:gap-16 lg:px-12 lg:py-16">
        <section className="lg:self-start lg:pt-10">
          <p className="eyebrow text-band-muted">{eyebrow}</p>
          <Headline className="font-display mt-5 text-[2.5rem] leading-[1.05] font-bold tracking-tight sm:text-6xl xl:text-7xl">
            <span className="text-band-foreground block">{headline}</span>
            {headlineAccent && (
              <span className="text-brand block">{headlineAccent}</span>
            )}
          </Headline>
          <p className="text-band-muted mt-5 max-w-md text-base sm:text-lg">
            {subline}
          </p>
        </section>

        <div className="border-border bg-card/95 w-full border p-6 shadow-[var(--elev-lg)] backdrop-blur-sm sm:p-10 lg:max-w-md lg:justify-self-end">
          <BrandMark className="h-10 w-10" />
          <Title className="font-display mt-5 text-2xl leading-snug font-bold sm:text-3xl">
            {title}
          </Title>
          <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">
            {description}
          </p>
          <div className="mt-8">{children}</div>
        </div>
      </div>

      <footer className="mx-auto w-full max-w-7xl px-5 pb-6 sm:px-8 lg:px-12">
        <p className="text-band-muted text-xs">
          Alfa Rent · {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}
