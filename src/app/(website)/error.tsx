"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/shared/locale-provider";

/** Keeps a failed public page inside the brand instead of a stack trace. */
export default function WebsiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    console.error("Website route error:", error);
  }, [error]);

  return (
    <section className="bg-band text-band-foreground flex min-h-[70vh] items-center">
      <div className="mx-auto max-w-lg px-5 text-center">
        <span className="eyebrow text-band-muted">{t("error.eyebrow")}</span>
        <h1 className="font-display mt-4 text-3xl font-bold tracking-tight">
          {t("error.title")}
        </h1>
        <p className="text-band-muted mt-3 text-sm">{t("error.text")}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            className="border-band-border text-band-foreground hover:border-band-muted hover:text-band-foreground bg-transparent hover:bg-white/10"
            render={<Link href="/" />}
          >
            {t("error.backHome")}
          </Button>
          <Button onClick={reset}>{t("admin.tryAgain")}</Button>
          <Button
            variant="ghost"
            nativeButton={false}
            className="text-band-foreground hover:text-band-foreground hover:bg-white/10"
            render={<Link href="/contact" />}
          >
            {t("nav.contact")}
          </Button>
        </div>
      </div>
    </section>
  );
}
