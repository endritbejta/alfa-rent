import Image from "next/image";
import { ShieldCheck, Clock, BadgeEuro } from "lucide-react";
import { BrandMark } from "@/components/shared/brand-logo";
import { HeroSearch } from "@/components/forms/hero-search";
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";

const PROOF = [
  { icon: ShieldCheck, label: "home.proof.insured" },
  { icon: Clock, label: "home.proof.flexible" },
  { icon: BadgeEuro, label: "home.proof.transparent" },
] satisfies { icon: typeof ShieldCheck; label: TranslationKey }[];

/**
 * The storefront's opening band, in the staff sign-in page's visual language
 * (`AuthFrame`): a near-black ground with a dark-red glow, the taillight
 * photo faded into it, a red-dashed eyebrow and a two-line headline, white
 * then red. The search stays the call to action — availability first.
 *
 * Always dark, whatever the visitor's theme: the `dark` class swaps every
 * token below it, so the date fields and the accent red take the charcoal
 * palette's AA-checked values instead of the light theme's.
 *
 * The photo is a tight crop on the taillights (the badge cut away), dimmed
 * everywhere except the lights themselves. Below lg it sits behind the text,
 * dimmed to a fifth so the red headline still clears 3:1 and the grey subline
 * 4.5:1 over the brightest light, and fades out before the search. From lg it
 * sits on the right, bleeding off the edge, beside the headline rather than
 * behind it. One element at every
 * width, so the preload is never for an image the viewport does not show.
 */
export async function HomeHero() {
  const { t } = await getI18n();

  return (
    <section className="dark bg-band text-foreground relative isolate overflow-hidden">
      {/* The dark-red glow at the edges. Static, so nothing for
          reduced-motion to switch off. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_60%_at_100%_0%,rgb(220_32_40/0.12),transparent),radial-gradient(45%_60%_at_0%_100%,rgb(220_32_40/0.10),transparent)]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[72%] mask-b-from-55% mask-b-to-100% opacity-20 lg:inset-x-auto lg:right-0 lg:h-[78%] lg:w-1/2 lg:mask-t-from-85% lg:mask-t-to-100% lg:mask-b-from-75% lg:mask-l-from-50% lg:mask-l-to-100% lg:opacity-100 xl:w-[60%]"
      >
        <Image
          src="/images/hero-taillights.jpg"
          alt=""
          fill
          // Local file: the project's loader only resizes Cloudinary URLs,
          // so there is no srcset to choose from. The JPEG is already cut
          // to 1200px for this slot.
          unoptimized
          preload
          className="object-cover object-[45%_60%] contrast-125 saturate-125"
        />
        {/* Dim everything but the lights: clear over the taillight
            cluster, near-black toward the edges. */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_42%_at_50%_58%,transparent_0%,rgb(8_7_7/0.25)_55%,rgb(8_7_7/0.7)_100%)]" />
      </div>

      <div className="mx-auto max-w-6xl px-5 pt-14 pb-14 lg:pt-20 lg:pb-16">
        <div className="lg:max-w-[38rem]">
          <BrandMark className="h-10 w-10" />
          <p className="eyebrow text-band-muted mt-6">{t("home.eyebrow")}</p>
          <h1 className="font-display mt-5 text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-6xl lg:text-[3.25rem] xl:text-7xl">
            <span className="text-band-foreground block">
              {t("home.titleLine1")}
            </span>
            <span className="text-brand block">
              {t("home.titleLine2")} {t("home.titleAccent")}
            </span>
          </h1>
          <p className="text-band-muted mt-5 max-w-md text-base sm:text-lg">
            {t("home.intro")}
          </p>
        </div>

        <HeroSearch />

        <ul className="border-band-border mt-10 flex flex-wrap gap-x-10 gap-y-3 border-t pt-6">
          {PROOF.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="text-band-muted flex items-center gap-2.5 text-sm"
            >
              <Icon aria-hidden="true" className="text-brand h-4.5 w-4.5" />
              {t(label)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
