"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, ArrowRight, X } from "lucide-react";
import { useI18n } from "@/components/shared/locale-provider";

const STORAGE_KEY = "alfa.alerts.dismissed";

/**
 * Operational alerts that follow staff across every page.
 *
 * Dismissal is keyed to a signature of the underlying state rather than a
 * flag: hiding "2 pending requests" stays hidden while it is still those
 * two, and returns the moment a third arrives. Nothing is lost — the work
 * is still on its own page — so no confirmation is warranted.
 */
export function PendingBanner({ pendingCount }: { pendingCount: number }) {
  const { t } = useI18n();
  const pendingSig = `pending:${pendingCount}`;

  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const timer = setTimeout(() => {
      try {
        setDismissed(JSON.parse(raw));
      } catch {
        setDismissed([]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = (sig: string) => {
    const next = [...dismissed, sig];
    setDismissed(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(-8)));
  };

  if (pendingCount === 0 || dismissed.includes(pendingSig)) return null;

  return (
    <div className="mb-5 space-y-2">
      <Alert
        tone="brand"
        icon={BellRing}
        href="/admin/reservations?status=PENDING"
        cta={t("admin.review")}
        onDismiss={() => dismiss(pendingSig)}
      >
        <span className="text-brand font-bold">
          {t(
            pendingCount === 1
              ? "admin.pendingAlert"
              : "admin.pendingAlertPlural",
            { count: pendingCount }
          )}
        </span>
      </Alert>
    </div>
  );
}

const TONES = {
  brand: {
    frame: "border-brand/25 bg-brand/[0.07] hover:bg-brand/[0.11]",
    badge: "bg-brand",
    cta: "text-brand",
  },
} as const;

function Alert({
  tone,
  icon: Icon,
  href,
  cta,
  onDismiss,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ElementType;
  href: string;
  cta: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const style = TONES[tone];
  return (
    <div
      className={`group flex items-center gap-3 rounded-none border px-4 py-3 transition-colors ${style.frame}`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${style.badge}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <Link href={href} className="min-w-0 flex-1 text-sm font-medium">
        {children}
      </Link>
      <Link
        href={href}
        className={`flex shrink-0 items-center gap-1 text-xs font-semibold ${style.cta}`}
      >
        {cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      <button
        type="button"
        aria-label={t("admin.dismissNotification")}
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
