import Link from "next/link";
import { BellRing, ArrowRight, ShieldAlert } from "lucide-react";
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

/**
 * Operational alerts that must survive navigation: pending requests and
 * lapsing registrations. Rendered by the admin layout, so it is present on
 * every page and cannot be dismissed away while the work is still open.
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
  if (pendingCount === 0 && registrationAlerts.length === 0) return null;

  return (
    <div className="mb-5 space-y-2">
      {pendingCount > 0 && (
        <Link
          href="/admin/reservations?status=PENDING"
          className="border-brand/25 bg-brand/[0.07] hover:bg-brand/[0.11] group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
        >
          <span className="bg-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white">
            <BellRing className="h-4 w-4" />
          </span>
          <p className="flex-1 text-sm font-medium">
            You have{" "}
            <span className="text-brand font-bold">
              {pendingCount} pending reservation request
              {pendingCount === 1 ? "" : "s"}
            </span>{" "}
            requiring attention.
          </p>
          <span className="text-brand flex items-center gap-1 text-xs font-semibold">
            Review
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}

      {registrationAlerts.length > 0 && (
        <Link
          href="/admin/vehicles"
          className={
            expired.length
              ? "border-destructive/30 bg-destructive/[0.07] hover:bg-destructive/[0.11] group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
              : "border-status-maint/30 bg-status-maint/[0.07] hover:bg-status-maint/[0.12] group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
          }
        >
          <span
            className={
              expired.length
                ? "bg-destructive flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                : "bg-status-maint flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
            }
          >
            <ShieldAlert className="h-4 w-4" />
          </span>
          <p className="flex-1 text-sm font-medium">
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
              <>
                <span className="text-status-maint font-bold">
                  {due.length} expiring within 30 days
                </span>
              </>
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
          </p>
          <span className="flex items-center gap-1 text-xs font-semibold">
            Fleet
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      )}
    </div>
  );
}
