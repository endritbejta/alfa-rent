"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, ArrowRight, ShieldAlert, X } from "lucide-react";
import { vehicleLabel } from "@/utils/vehicle";

type RegistrationAlert = {
  id: string;
  brand: string;
  model: string;
  plate: string | null;
  year: number;
  state: "ok" | "due" | "expired" | "unknown";
  daysLeft: number | null;
};

const STORAGE_KEY = "alfa.alerts.dismissed";

/**
 * Operational alerts that follow staff across every page.
 *
 * Dismissal is keyed to a signature of the underlying state rather than a
 * flag: hiding "2 pending requests" stays hidden while it is still those
 * two, and returns the moment a third arrives. Nothing is lost — the work
 * is still on its own page — so no confirmation is warranted.
 */
export function PendingBanner({
  pendingCount,
  registrationAlerts,
}: {
  pendingCount: number;
  registrationAlerts: RegistrationAlert[];
}) {
  const expired = registrationAlerts.filter((a) => a.state === "expired");
  const due = registrationAlerts.filter((a) => a.state === "due");

  const pendingSig = `pending:${pendingCount}`;
  const regSig = `reg:${expired.length}-${due.length}`;

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

  const showPending = pendingCount > 0 && !dismissed.includes(pendingSig);
  const showReg = registrationAlerts.length > 0 && !dismissed.includes(regSig);
  if (!showPending && !showReg) return null;

  // Send staff to the exact slice the alert is about.
  const regHref = expired.length
    ? "/admin/vehicles?registration=expired#fleet"
    : "/admin/vehicles?registration=due#fleet";

  return (
    <div className="mb-5 space-y-2">
      {showPending && (
        <Alert
          tone="brand"
          icon={BellRing}
          href="/admin/reservations?status=PENDING"
          cta="Review"
          onDismiss={() => dismiss(pendingSig)}
        >
          You have{" "}
          <span className="text-brand font-bold">
            {pendingCount} pending reservation request
            {pendingCount === 1 ? "" : "s"}
          </span>{" "}
          requiring attention.
        </Alert>
      )}

      {showReg && (
        <Alert
          tone={expired.length ? "danger" : "warn"}
          icon={ShieldAlert}
          href={regHref}
          cta={expired.length ? "Fix expired" : "Review"}
          onDismiss={() => dismiss(regSig)}
        >
          {expired.length > 0 && (
            <>
              <span className="text-destructive font-bold">
                {expired.length} vehicle{expired.length === 1 ? "" : "s"} with
                expired registration
              </span>
              {due.length > 0 && " and "}
            </>
          )}
          {due.length > 0 && (
            <span className="text-status-maint font-bold">
              {due.length} expiring within 30 days
            </span>
          )}
          <span className="text-muted-foreground">
            {" — "}
            {registrationAlerts
              .slice(0, 2)
              .map((a) => vehicleLabel(a))
              .join(", ")}
            {registrationAlerts.length > 2 &&
              ` +${registrationAlerts.length - 2} more`}
          </span>
        </Alert>
      )}
    </div>
  );
}

const TONES = {
  brand: {
    frame: "border-brand/25 bg-brand/[0.07] hover:bg-brand/[0.11]",
    badge: "bg-brand",
    cta: "text-brand",
  },
  danger: {
    frame:
      "border-destructive/30 bg-destructive/[0.07] hover:bg-destructive/[0.11]",
    badge: "bg-destructive",
    cta: "text-destructive",
  },
  warn: {
    frame:
      "border-status-maint/30 bg-status-maint/[0.07] hover:bg-status-maint/[0.12]",
    badge: "bg-status-maint",
    cta: "text-status-maint",
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
  const style = TONES[tone];
  return (
    <div
      className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${style.frame}`}
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
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
