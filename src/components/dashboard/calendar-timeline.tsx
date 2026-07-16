"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { createManualReservationAction } from "@/app/(dashboard)/admin/calendar/actions";
import { DateRangePicker } from "@/components/forms/date-range-picker";
import { Button } from "@/components/ui/button";
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

const NAME_W = 200;
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
          className="transition-transform duration-150 hover:scale-[1.03] active:scale-100"
        >
          <Plus className="h-4 w-4" />
          Add reservation
        </Button>

        <div className="flex items-center gap-2">
          <div className="bg-secondary inline-flex rounded-full border p-0.5">
            {(
              [
                ["compact", "Month"],
                ["comfortable", "Week"],
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
              aria-label="Previous month"
              onClick={() => jumpMonth(-1)}
              className="hover:bg-secondary cursor-pointer rounded-full p-1.5 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[7.5rem] text-center text-xs font-semibold tabular-nums">
              {visibleMonth}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => jumpMonth(1)}
              className="hover:bg-secondary cursor-pointer rounded-full p-1.5 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <p className="text-muted-foreground mb-2 text-xs">
        Scroll sideways to move through months. Click a rental to trace its
        dates, or an empty row to book.
      </p>

      <div
        ref={scroller}
        onScroll={syncMonth}
        className="bg-card max-h-[68vh] overflow-auto overscroll-x-contain rounded-xl border shadow-xs"
      >
        <div style={{ width: NAME_W + gridW }}>
          {/* Header: month band + day numbers */}
          <div
            className="bg-card sticky top-0 z-30 border-b"
            style={{ width: NAME_W + gridW }}
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
                Vehicle
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
                style={{ width: NAME_W + gridW }}
              >
                <div
                  className="bg-card sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r px-3 py-1.5 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]"
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
                  role="presentation"
                  onClick={(e) =>
                    openFromIndex(
                      row.id,
                      Math.floor(e.nativeEvent.offsetX / dayW)
                    )
                  }
                  className="relative shrink-0 cursor-copy"
                  style={{ width: gridW, height: 46, ...gridLines }}
                >
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
                        title={`${r.customerName} (${r.status.toLowerCase()})`}
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
                        className={cn(
                          "absolute top-2 z-10 h-7 cursor-pointer truncate rounded-md px-2 text-left text-xs leading-7 transition-shadow",
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicleId: state.vehicleId,
    customerName: "",
    from: state.from,
    to: state.to,
    status: "CONFIRMED" as BarStatus,
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
      onClose();
    });
  };

  const field =
    "border-input focus:ring-ring h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2";
  const STATUS: { value: BarStatus; label: string; dot: string }[] = [
    { value: "PENDING", label: "Pending", dot: "bg-status-maint" },
    { value: "CONFIRMED", label: "Confirmed", dot: "bg-status-reserved" },
    { value: "ACTIVE", label: "Active", dot: "bg-status-rented" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="bg-card relative z-10 w-full max-w-md rounded-2xl border p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Add reservation</h2>
            <p className="text-muted-foreground text-xs">
              Log a phone or walk-in booking
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer"
          >
            <X className="text-muted-foreground h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">Vehicle</span>
            <select
              className={cn(field, "cursor-pointer")}
              value={form.vehicleId}
              onChange={(e) => set("vehicleId", e.target.value)}
            >
              <option value="">Choose a vehicle</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold">
              Customer name
            </span>
            <input
              className={field}
              value={form.customerName}
              onChange={(e) => set("customerName", e.target.value)}
              placeholder="e.g. Arben Krasniqi"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-semibold">Dates</span>
            <DateRangePicker
              tone="light"
              labels={{ from: "Start", to: "End" }}
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
            <span className="mb-1.5 block text-xs font-semibold">Status</span>
            <div className="grid grid-cols-3 gap-2">
              {STATUS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => set("status", s.value)}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors",
                    form.status === s.value
                      ? "border-foreground bg-secondary"
                      : "text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold">Notes</span>
            <input
              className={field}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Phone reservation"
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
            {pending ? "Saving..." : "Create reservation"}
          </Button>
        </div>
      </div>
    </div>
  );
}
