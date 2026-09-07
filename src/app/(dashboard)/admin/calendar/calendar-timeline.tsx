"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { createManualReservationAction } from "./actions";
import { useDetailDrawer } from "@/components/dashboard/detail-drawer-context";
import { DateRangePicker } from "@/components/forms/date-range-picker";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/shared/locale-provider";
import { toasts } from "@/components/dashboard/toaster";
import { cn } from "@/lib/utils";

type BarStatus = "PENDING" | "CONFIRMED" | "ACTIVE";

type Reservation = {
  id: string;
  customerName: string;
  start: number;
  span: number;
  status: BarStatus;
};

type Row = {
  id: string;
  name: string;
  sub: string;
  reservations: Reservation[];
};

/** Month band across the continuous strip: where it starts and how wide. */
type MonthMarker = { key: string; label: string; start: number; days: number };

type Props = {
  dayLabels: string[];
  dayDates: string[]; // YYYY-MM-DD per column, continuous across months
  months: MonthMarker[];
  todayIndex: number | null;
  rows: Row[];
  vehicleOptions: { id: string; name: string }[];
};

const BAR_STYLES: Record<BarStatus, string> = {
  PENDING: "bg-status-maint/85 text-white",
  CONFIRMED: "bg-status-reserved/90 text-white",
  ACTIVE: "bg-status-rented/90 text-white",
};

/**
 * Vehicle column width, as a CSS variable rather than a number so it can
 * shrink at the mobile breakpoint. At a fixed 200px it took over half a
 * 375px screen, leaving about three days of calendar visible — the column
 * naming the rows was crowding out the rows. The value is set on the
 * scroller; everything else derives from it.
 */
const NAME_W = "var(--name-w)";
/** The sticky column plus the day grid — the scrollable width of a row. */
const rowW = (gridW: number) => `calc(${NAME_W} + ${gridW}px)`;

const ZOOMS = { compact: 34, comfortable: 68 } as const;
type Zoom = keyof typeof ZOOMS;

const pad = (n: number) => String(n).padStart(2, "0");
function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

type Selection = { rowId: string; id: string; start: number; end: number };
type ModalState = { vehicleId: string; from: string; to: string };

export function CalendarTimeline({
  dayLabels,
  dayDates,
  months,
  todayIndex,
  rows,
  vehicleOptions,
}: Props) {
  const { t } = useI18n();
  const { openReservation } = useDetailDrawer();
  const [zoom, setZoom] = useState<Zoom>("compact");
  const dayW = ZOOMS[zoom];
  const days = dayDates.length;
  const gridW = days * dayW;

  const scroller = useRef<HTMLDivElement>(null);
  const [visibleMonth, setVisibleMonth] = useState(months[0]?.label ?? "");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  /** Which month occupies the left edge of the viewport. */
  const syncMonth = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const index = Math.round((el.scrollLeft + 8) / dayW);
    const current =
      [...months].reverse().find((m) => index >= m.start) ?? months[0];
    if (current) setVisibleMonth(current.label);
  }, [dayW, months]);

  // Land on today rather than the far past.
  useEffect(() => {
    const el = scroller.current;
    if (!el || todayIndex === null) return;
    el.scrollLeft = Math.max(0, todayIndex * dayW - dayW * 3);
    syncMonth();
  }, [dayW, todayIndex, syncMonth]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setModal(null);
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Prev/Next stay as secondary nav: they scroll, they don't paginate. */
  const jumpMonth = (direction: -1 | 1) => {
    const el = scroller.current;
    if (!el) return;
    const index = Math.round((el.scrollLeft + 8) / dayW);
    const target =
      direction === 1
        ? months.find((m) => m.start > index + 1)
        : [...months].reverse().find((m) => m.start < index - 1);
    el.scrollTo({
      left: target ? target.start * dayW : direction === 1 ? el.scrollWidth : 0,
      behavior: "smooth",
    });
  };

  const openFromIndex = (vehicleId: string, index: number) => {
    const from = dayDates[Math.max(0, Math.min(index, days - 1))];
    setModal({ vehicleId, from, to: addDays(from, 1) });
  };

  const inSelectedRange = (index: number) =>
    selected && index >= selected.start && index <= selected.end;

  // One background gradient draws every day divider — far cheaper than a
  // node per cell across ~150 days x 49 vehicles.
  const gridLines = {
    backgroundImage: `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${dayW}px)`,
  };

  return (
    <div>
      {/* Toolbar: primary action left, navigation right */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Button
          size="sm"
          onClick={() => openFromIndex("", todayIndex ?? 0)}
          className="transition-transform duration-[var(--motion-press)] ease-[var(--ease-standard)] active:scale-[0.97] motion-reduce:transition-none"
        >
          <Plus className="h-4 w-4" />
          {t("admin.addReservation")}
        </Button>

        <div className="flex items-center gap-2">
          <div className="bg-secondary inline-flex rounded-full border p-0.5">
            {(
              [
                ["compact", t("admin.month")],
                ["comfortable", t("admin.week")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={zoom === key}
                onClick={() => setZoom(key)}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  zoom === key
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="bg-card flex items-center gap-1 rounded-full border p-0.5">
            <button
              type="button"
              aria-label={t("admin.previousMonth")}
              onClick={() => jumpMonth(-1)}
              className="hover:bg-surface-hover cursor-pointer rounded-full p-1.5 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[7.5rem] text-center text-xs font-semibold tabular-nums">
              {visibleMonth}
            </span>
            <button
              type="button"
              aria-label={t("admin.nextMonth")}
              onClick={() => jumpMonth(1)}
              className="hover:bg-surface-hover cursor-pointer rounded-full p-1.5 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground mb-2 text-xs">
        {t("admin.calendarHelp")}
      </p>

      <div
        ref={scroller}
        onScroll={syncMonth}
        className="bg-card max-h-[68vh] overflow-auto overscroll-x-contain rounded-xl border shadow-xs [--name-w:7.5rem] sm:[--name-w:12.5rem]"
      >
        <div style={{ width: rowW(gridW) }}>
          {/* Header: month band + day numbers */}
          <div
            className="bg-card sticky top-0 z-30 border-b"
            style={{ width: rowW(gridW) }}
          >
            <div className="flex">
              <div
                className="bg-card sticky left-0 z-40 shrink-0 border-r"
                style={{ width: NAME_W }}
              />
              <div className="relative h-7" style={{ width: gridW }}>
                {months.map((m) => (
                  <span
                    key={m.key}
                    className="text-muted-foreground absolute top-0 flex h-7 items-center border-l pl-2 text-[11px] font-bold tracking-wide uppercase"
                    style={{ left: m.start * dayW, width: m.days * dayW }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex">
              <div
                className="bg-card text-muted-foreground sticky left-0 z-40 shrink-0 border-r p-2 text-xs font-semibold"
                style={{ width: NAME_W }}
              >
                {t("admin.vehicle")}
              </div>
              <div className="relative" style={{ width: gridW }}>
                <div className="flex">
                  {dayLabels.map((label, i) => (
                    <span
                      key={i}
                      className={cn(
                        "text-muted-foreground shrink-0 py-1.5 text-center text-[11px] tabular-nums",
                        todayIndex === i &&
                          "bg-accent text-accent-foreground font-bold",
                        inSelectedRange(i) &&
                          "bg-brand/10 text-foreground font-semibold"
                      )}
                      style={{ width: dayW }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle rows */}
          {rows.map((row) => {
            const dimmed = selected && selected.rowId !== row.id;
            const focused = selected && selected.rowId === row.id;
            return (
              <div
                key={row.id}
                className={cn(
                  "flex border-b transition-opacity last:border-b-0",
                  dimmed && "opacity-40",
                  focused && "bg-brand/[0.04]"
                )}
                style={{ width: rowW(gridW) }}
              >
                <div
                  className="bg-card shadow-sticky sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r px-3 py-1.5"
                  style={{ width: NAME_W }}
                >
                  <span className="truncate text-sm font-medium">
                    {row.name}
                  </span>
                  {row.sub && (
                    <span className="text-muted-foreground truncate font-mono text-[10px]">
                      {row.sub}
                    </span>
                  )}
                </div>

                <div
                  className="relative shrink-0"
                  style={{ width: gridW, height: 46, ...gridLines }}
                >
                  {dayDates.map((date, index) => (
                    <button
                      key={date}
                      type="button"
                      aria-label={t("admin.bookVehicleDate", {
                        vehicle: row.name,
                        date,
                      })}
                      onClick={() => openFromIndex(row.id, index)}
                      className="hover:bg-brand/5 focus-visible:ring-brand absolute inset-y-0 z-0 cursor-copy focus-visible:z-20 focus-visible:ring-2 focus-visible:outline-none"
                      style={{ left: index * dayW, width: dayW }}
                    />
                  ))}

                  {/* Month boundaries read stronger than day lines */}
                  {months.map((m) => (
                    <span
                      key={m.key}
                      className="bg-border pointer-events-none absolute inset-y-0 w-px"
                      style={{ left: m.start * dayW }}
                    />
                  ))}

                  {todayIndex !== null && (
                    <span
                      className="bg-brand pointer-events-none absolute inset-y-0 z-10 w-0.5"
                      style={{ left: (todayIndex + 0.5) * dayW }}
                    />
                  )}

                  {row.reservations.map((r) => {
                    const active = selected?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={active}
                        title={t("admin.openRentalDetails", {
                          customer: r.customerName,
                          status: t(
                            `vehicle.${r.status.toLowerCase()}` as
                              | "vehicle.pending"
                              | "vehicle.confirmed"
                              | "vehicle.active"
                          ),
                        })}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(
                            active
                              ? null
                              : {
                                  rowId: row.id,
                                  id: r.id,
                                  start: r.start,
                                  end: r.start + r.span - 1,
                                }
                          );
                        }}
                        // Single click traces the dates, so detail goes on the
                        // second — the cheap gesture keeps the cheap job.
                        // The two clicks that precede a dblclick toggle the
                        // trace off again, so set it outright: a double-click
                        // leaves the rental both traced and open.
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setSelected({
                            rowId: row.id,
                            id: r.id,
                            start: r.start,
                            end: r.start + r.span - 1,
                          });
                          openReservation(r.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          e.stopPropagation();
                          setSelected({
                            rowId: row.id,
                            id: r.id,
                            start: r.start,
                            end: r.start + r.span - 1,
                          });
                          openReservation(r.id);
                        }}
                        className={cn(
                          "absolute top-2 z-10 h-7 cursor-pointer truncate rounded-md px-2 text-center text-xs leading-7 transition-shadow",
                          BAR_STYLES[r.status],
                          active && "ring-foreground/70 shadow-md ring-2"
                        )}
                        style={{
                          left: r.start * dayW + 2,
                          width: r.span * dayW - 4,
                        }}
                      >
                        {r.customerName}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modal && (
        <BookingModal
          state={modal}
          vehicleOptions={vehicleOptions}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function BookingModal({
  state,
  vehicleOptions,
  onClose,
}: {
  state: ModalState;
  vehicleOptions: { id: string; name: string }[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  type NewReservationStatus = "PENDING" | "CONFIRMED";
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicleId: state.vehicleId,
    customerName: "",
    from: state.from,
    to: state.to,
    status: "CONFIRMED" as NewReservationStatus,
    notes: "",
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createManualReservationAction({
        vehicleId: form.vehicleId,
        customerName: form.customerName,
        pickupDate: `${form.from}T10:00:00Z`,
        returnDate: `${form.to}T10:00:00Z`,
        status: form.status,
        notes: form.notes || undefined,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      toasts.success(t("toast.reservationCreated"));
      onClose();
    });
  };

  const field =
    "border-input bg-control focus:ring-ring h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2";
  const STATUS: {
    value: NewReservationStatus;
    label: string;
    dot: string;
  }[] = [
    { value: "PENDING", label: t("vehicle.pending"), dot: "bg-status-maint" },
    {
      value: "CONFIRMED",
      label: t("vehicle.confirmed"),
      dot: "bg-status-reserved",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("common.close")}
        className="bg-overlay-modal absolute inset-0"
        onClick={onClose}
      />
      <div className="bg-card relative z-10 w-full max-w-md rounded-xl border p-6 shadow-lg">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">
              {t("admin.addReservation")}
            </h2>
            <p className="text-muted-foreground text-xs">
              {t("admin.manualReservationHelp")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="cursor-pointer"
          >
            <X className="text-muted-foreground h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">
              {t("admin.vehicle")}
            </span>
            <select
              className={cn(field, "cursor-pointer")}
              value={form.vehicleId}
              onChange={(e) => set("vehicleId", e.target.value)}
            >
              <option value="">{t("admin.chooseVehicle")}</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold">
              {t("admin.customerName")}
            </span>
            <input
              className={field}
              value={form.customerName}
              onChange={(e) => set("customerName", e.target.value)}
              placeholder={t("admin.customerNamePlaceholder")}
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-semibold">
              {t("admin.dates")}
            </span>
            <DateRangePicker
              tone="light"
              labels={{ from: t("common.from"), to: t("common.to") }}
              value={{
                from: form.from ? parseISO(form.from) : undefined,
                to: form.to ? parseISO(form.to) : undefined,
              }}
              onChange={(range) =>
                setForm((f) => ({
                  ...f,
                  from: range?.from ? format(range.from, "yyyy-MM-dd") : "",
                  to: range?.to ? format(range.to, "yyyy-MM-dd") : "",
                }))
              }
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold">
              {t("admin.status")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {STATUS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => set("status", s.value)}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors",
                    form.status === s.value
                      ? "border-foreground bg-secondary"
                      : "text-muted-foreground hover:bg-surface-hover"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold">
              {t("admin.notes")}
            </span>
            <input
              className={field}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder={t("admin.phoneReservation")}
            />
          </label>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <Button
            className="w-full"
            disabled={
              pending || !form.vehicleId || form.customerName.length < 2
            }
            onClick={submit}
          >
            {pending ? t("admin.saving") : t("admin.createReservation")}
          </Button>
        </div>
      </div>
    </div>
  );
}
