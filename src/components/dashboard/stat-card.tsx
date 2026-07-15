import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn" | "danger";
  href?: string;
};

const TONES = {
  default: "text-foreground",
  good: "text-status-available",
  warn: "text-status-maint",
  danger: "text-destructive",
};

export function StatCard({ label, value, hint, tone = "default" }: Props) {
  return (
    <div className="bg-card rounded-xl border p-4 shadow-xs transition-shadow hover:shadow-sm sm:p-5">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          "font-display mt-1.5 text-2xl font-bold tabular-nums",
          TONES[tone]
        )}
      >
        {value}
      </p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </div>
  );
}

export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4",
        className
      )}
    >
      {children}
    </div>
  );
}
