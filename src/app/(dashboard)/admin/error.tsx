"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/shared/locale-provider";
import { reportError } from "@/lib/observability";

/**
 * Catches anything thrown while rendering an admin page — a failed guard, a
 * dropped database connection — so staff land on the product rather than a
 * raw stack trace.
 *
 * Next strips the message in production and leaves only `digest`, so this
 * cannot explain the cause. That is the point: the digest is the thread to
 * pull in the logs, and it is safe to show.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    reportError(error, { scope: "admin-boundary", digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-sm">
        <span className="bg-destructive/10 text-destructive mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="font-display text-lg font-bold">
          {t("admin.screenFailed")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          {t("admin.screenFailedHelp")}
        </p>
        {error.digest && (
          <p className="text-muted-foreground mt-3 font-mono text-xs">
            {t("admin.reference", { id: error.digest })}
          </p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/admin/dashboard" />}
          >
            {t("admin.backDashboard")}
          </Button>
          <Button size="sm" onClick={reset}>
            <RotateCw className="h-4 w-4" />
            {t("admin.tryAgain")}
          </Button>
        </div>
      </div>
    </div>
  );
}
