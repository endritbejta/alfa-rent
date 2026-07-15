"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createManualReservationAction } from "@/app/(dashboard)/admin/calendar/actions";
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

type Row = { id: string; name: string; reservations: Reservation[] };

type Props = {
  view: "month" | "week";
  days: number;
  dayLabels: string[];
  dayDates: string[]; // YYYY-MM-DD per column
  todayIndex: number | null;
  rows: Row[];
  vehicleOptions: { id: string; name: string }[];
};

const BAR_STYLES: Record<BarStatus, string> = {
  PENDING: "bg-status-maint/85 text-white",
  CONFIRMED: "bg-status-reserved/90 text-white",
  ACTIVE: "bg-status-rented/90 text-white",
};

const NAME_W = 176;
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
  view,
  days,
  dayLabels,
  dayDates,
  todayIndex,
  rows,
  vehicleOptions,
}: Props) {
  const dayW = view === "week" ? 92 : 40;
  const gridW = days * dayW;

  const [selected, setSelected] = useState<Selection | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  // Escape clears selection / closes modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setModal(null);
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openFromCell = (vehicleId: string, index: number) => {
    const from = dayDates[index];
    setModal({ vehicleId, from, to: addDays(from, 1) });
  };

  const openBlank = () => {
    const from = dayDates[todayIndex ?? 0] ?? dayDates[0];
    setModal({ vehicleId: "", from, to: addDays(from, 1) });
  };

  const inSelectedRange = (index: number) =>
    selected && index >= selected.start && index <= selected.end;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-muted-foreground text-xs">
          Click an empty cell to book, or a rental to trace its dates.
        </p>
        <Button size="sm" onClick={openBlank}>
          <Plus className="h-4 w-4" />
          Add reservation
        </Button>
      </div>

      {/* Two-way sticky scroll container */}
      <div className="bg-card max-h-[68vh] overflow-auto rounded-xl border shadow-xs">
        <div style={{ width: NAME_W + gridW }}>
          {/* Header row — sticky top */}
          <div
            className="bg-card sticky top-0 z-30 flex border-b"
            style={{ width: NAME_W + gridW }}
          >
            {/* Corner — sticky both axes */}
            <div
              className="bg-card text-muted-foreground sticky left-0 z-40 shrink-0 border-r p-2 text-xs font-semibold"
              style={{ width: NAME_W }}
            >
              Vehicle
            </div>
            {dayLabels.map((label, i) => (
              <div
                key={i}
                className={cn(
                  "text-muted-foreground shrink-0 border-r py-1.5 text-center text-xs last:border-r-0",
                  todayIndex === i &&
                    "bg-accent text-accent-foreground font-bold",
                  inSelectedRange(i) &&
                    "bg-brand/10 text-foreground font-semibold"
                )}
                style={{ width: dayW }}
              >
                {label}
              </div>
            ))}
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
                {/* Sticky vehicle name */}
                <div
                  className="bg-card sticky left-0 z-20 flex shrink-0 items-center truncate border-r p-2 text-sm font-medium shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]"
                  style={{ width: NAME_W }}
                >
                  <span className="truncate">{row.name}</span>
                </div>

                {/* Day track */}
                <div
                  className="relative shrink-0"
                  style={{ width: gridW, height: 44 }}
                >
                  {/* Grid lines + empty-cell click targets */}
                  <div className="absolute inset-0 flex">
                    {dayDates.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`Book ${row.name} on ${dayDates[i]}`}
                        onClick={() => openFromCell(row.id, i)}
                        className={cn(
                          "hover:bg-brand/5 border-border/60 shrink-0 border-r last:border-r-0",
                          inSelectedRange(i) && "bg-brand/5"
                        )}
                        style={{ width: dayW }}
                      />
                    ))}
                  </div>

                  {/* Today line */}
                  {todayIndex !== null && (
                    <span
                      className="bg-brand pointer-events-none absolute inset-y-0 z-10 w-0.5"
                      style={{ left: (todayIndex + 0.5) * dayW }}
                    />
                  )}

                  {/* Rental bars */}
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
                          "absolute top-1.5 z-10 h-7 truncate rounded px-1.5 text-left text-xs leading-7 transition-shadow",
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
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="text-muted-foreground h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold">Vehicle</span>
            <select
              className={field}
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

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">Start</span>
              <input
                type="date"
                className={field}
                value={form.from}
                onChange={(e) => set("from", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">End</span>
              <input
                type="date"
                className={field}
                min={form.from}
                value={form.to}
                onChange={(e) => set("to", e.target.value)}
              />
            </label>
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
                    "flex items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors",
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
