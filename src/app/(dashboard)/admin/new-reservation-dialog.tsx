"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { AlertTriangle, Search, UserRound, X } from "lucide-react";
import {
  createManualReservationAction,
  previewManualReservationAction,
} from "./calendar/actions";
import { searchCustomersAction, type CustomerHit } from "./customers/actions";
import type {
  BookingPreview,
  BookingProblem,
} from "@/services/reservation.service";
import { DateRangePicker } from "@/components/forms/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/shared/locale-provider";
import { PendingStatus } from "@/components/shared/pending-status";
import { toasts } from "@/components/dashboard/toaster";
import { formatEur } from "@/lib/money";
import { cn } from "@/lib/utils";

export type VehicleOption = { id: string; name: string };

export type NewReservationSeed = {
  vehicleId: string;
  from: string; // yyyy-MM-dd
  to: string;
};

type Status = "PENDING" | "CONFIRMED";

type NewCustomer = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

const SEARCH_DEBOUNCE_MS = 250;

/** Problems that make a booking impossible whatever its status. */
const ALWAYS_REFUSED: BookingProblem["kind"][] = ["inactive"];

/**
 * Logs a phone or walk-in booking.
 *
 * The customer is either found on file or entered with a phone number — the
 * old dialog took a name only, so a phone booking left staff no way to call
 * back and every walk-in became another duplicate record. Once a vehicle and
 * dates are chosen, the price that will be stored and anything standing in
 * the way are shown before the operator commits; the server still re-checks
 * all of it.
 *
 * Through Dialog, like every other overlay in the admin: focus is trapped and
 * restored, and every dismissal arrives as onOpenChange(false). It only mounts
 * while open.
 */
export function NewReservationDialog({
  seed,
  vehicleOptions,
  onClose,
}: {
  seed: NewReservationSeed;
  vehicleOptions: VehicleOption[];
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [vehicleId, setVehicleId] = useState(seed.vehicleId);
  const [range, setRange] = useState({ from: seed.from, to: seed.to });
  const [status, setStatus] = useState<Status>("CONFIRMED");
  const [notes, setNotes] = useState("");

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selected, setSelected] = useState<CustomerHit | null>(null);
  const [newCustomer, setNewCustomer] = useState<NewCustomer>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });

  // The preview belongs to the inputs it was computed for; anything else on
  // screen would be a stale price.
  const previewKey =
    vehicleId && range.from && range.to
      ? `${vehicleId}|${range.from}|${range.to}`
      : null;
  const [preview, setPreview] = useState<{
    key: string;
    result: BookingPreview | { error: string };
  } | null>(null);

  useEffect(() => {
    if (!previewKey) return;
    let cancelled = false;
    void previewManualReservationAction({
      vehicleId,
      pickupDate: `${range.from}T10:00:00Z`,
      returnDate: `${range.to}T10:00:00Z`,
    }).then((result) => {
      if (cancelled) return;
      setPreview({
        key: previewKey,
        result: "error" in result ? result : result.preview,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [previewKey, vehicleId, range.from, range.to]);

  const current = preview?.key === previewKey ? preview.result : null;
  const quote = current && !("error" in current) ? current : null;
  const problems = quote?.problems ?? [];
  // A pending request may overlap a booking or wait on an overdue car — it
  // commits nothing — but nothing is saved for a retired car, and a
  // confirmed booking must be free of every problem.
  const refused = problems.some(
    (p) => status === "CONFIRMED" || ALWAYS_REFUSED.includes(p.kind)
  );

  const customerReady =
    mode === "existing"
      ? selected !== null
      : newCustomer.firstName.trim().length > 0 &&
        newCustomer.phone.trim().length >= 6;

  const canSubmit =
    !pending && !!previewKey && quote !== null && customerReady && !refused;

  const day = (value: string) =>
    format(parseISO(value), "dd MMM yyyy", { locale: dateLocale });
  const eur = (value: number) => formatEur(value, locale);

  const problemText = (problem: BookingProblem) => {
    switch (problem.kind) {
      case "inactive":
        return t("admin.problemInactive");
      case "overdue":
        return t("admin.problemOverdue", { date: day(problem.date) });
      case "booked":
        return t("admin.problemBooked", {
          from: day(problem.from),
          to: day(problem.to),
        });
    }
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await createManualReservationAction({
        vehicleId,
        customer:
          mode === "existing" && selected
            ? { kind: "existing", id: selected.id }
            : { kind: "new", ...newCustomer },
        pickupDate: `${range.from}T10:00:00Z`,
        returnDate: `${range.to}T10:00:00Z`,
        status,
        notes: notes || undefined,
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

  const STATUS: { value: Status; label: string; dot: string }[] = [
    { value: "PENDING", label: t("vehicle.pending"), dot: "bg-status-maint" },
    {
      value: "CONFIRMED",
      label: t("vehicle.confirmed"),
      dot: "bg-status-reserved",
    },
  ];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">
            {t("admin.addReservation")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {t("admin.manualReservationHelp")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="booking-vehicle" className="text-xs">
              {t("admin.vehicle")}
            </Label>
            <select
              id="booking-vehicle"
              className={cn(field, "cursor-pointer")}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              <option value="">{t("admin.chooseVehicle")}</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold">
              {t("admin.dates")}
            </span>
            <DateRangePicker
              tone="light"
              labels={{ from: t("common.from"), to: t("common.to") }}
              value={{
                from: range.from ? parseISO(range.from) : undefined,
                to: range.to ? parseISO(range.to) : undefined,
              }}
              onChange={(next) =>
                setRange({
                  from: next?.from ? format(next.from, "yyyy-MM-dd") : "",
                  to: next?.to ? format(next.to, "yyyy-MM-dd") : "",
                })
              }
            />
          </div>

          <QuotePanel
            ready={!!previewKey}
            current={current}
            problems={problems}
            problemText={problemText}
            eur={eur}
          />

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-xs font-semibold">
              {t("admin.customer")}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {(["existing", "new"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    "rounded-lg border py-2 text-xs font-semibold transition-colors",
                    mode === value
                      ? "border-foreground bg-secondary"
                      : "text-muted-foreground hover:bg-surface-hover"
                  )}
                >
                  {value === "existing"
                    ? t("admin.existingCustomer")
                    : t("admin.newCustomer")}
                </button>
              ))}
            </div>
            {mode === "existing" ? (
              <CustomerPicker selected={selected} onSelect={setSelected} />
            ) : (
              <NewCustomerFields
                value={newCustomer}
                onChange={setNewCustomer}
              />
            )}
          </fieldset>

          <div>
            <span className="mb-1.5 block text-xs font-semibold">
              {t("admin.status")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              {STATUS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={status === s.value}
                  onClick={() => setStatus(s.value)}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border py-2 text-xs font-semibold transition-colors",
                    status === s.value
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

          <div className="space-y-1">
            <Label htmlFor="booking-notes" className="text-xs">
              {t("admin.notes")}
            </Label>
            <input
              id="booking-notes"
              className={field}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("admin.phoneReservation")}
              maxLength={1000}
            />
          </div>

          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}

          <Button className="w-full" disabled={!canSubmit} onClick={submit}>
            {pending ? t("admin.saving") : t("admin.createReservation")}
          </Button>
          <PendingStatus message={pending ? t("admin.saving") : null} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuotePanel({
  ready,
  current,
  problems,
  problemText,
  eur,
}: {
  ready: boolean;
  current: BookingPreview | { error: string } | null;
  problems: BookingProblem[];
  problemText: (problem: BookingProblem) => string;
  eur: (value: number) => string;
}) {
  const { t } = useI18n();
  if (!ready) return null;
  if (!current) {
    return (
      <p className="text-muted-foreground text-xs" aria-live="polite">
        {t("admin.checking")}
      </p>
    );
  }
  if ("error" in current) {
    return (
      <p role="alert" className="text-destructive text-xs">
        {current.error}
      </p>
    );
  }
  return (
    <div
      className="bg-secondary space-y-2 rounded-lg border p-3"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground text-xs">
          {t("admin.priceBreakdown", {
            days: current.days,
            price: eur(current.pricePerDay),
          })}
        </span>
        <span className="font-display font-bold tabular-nums">
          {t("admin.total")} {eur(current.totalPrice)}
        </span>
      </div>
      {problems.map((problem) => (
        <p
          key={problem.kind}
          className="text-status-maint flex gap-1.5 text-xs"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {problemText(problem)}
        </p>
      ))}
    </div>
  );
}

function CustomerPicker({
  selected,
  onSelect,
}: {
  selected: CustomerHit | null;
  onSelect: (hit: CustomerHit | null) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    query: string;
    hits: CustomerHit[];
    error?: string;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <UserRound className="text-muted-foreground h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">
            {selected.firstName} {selected.lastName}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {selected.phone} · {selected.email}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onSelect(null)}>
          <X className="h-3.5 w-3.5" />
          {t("admin.changeCustomer")}
        </Button>
      </div>
    );
  }

  const search = (next: string) => {
    setQuery(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void searchCustomersAction(next).then((found) =>
        setResult(
          "error" in found
            ? { query: next, hits: [], error: found.error }
            : { query: next, hits: found.hits }
        )
      );
    }, SEARCH_DEBOUNCE_MS);
  };

  const shown = result?.query === query ? result : null;

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => search(e.target.value)}
          aria-label={t("admin.findCustomer")}
          placeholder={t("admin.findCustomer")}
          className="pl-9 sm:pl-9"
        />
      </div>
      {shown?.error && (
        <p role="alert" className="text-destructive text-xs">
          {shown.error}
        </p>
      )}
      {shown && !shown.error && query.trim().length >= 2 && (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
          {shown.hits.length === 0 ? (
            <li className="text-muted-foreground p-3 text-xs">
              {t("admin.noCustomerFound")}
            </li>
          ) : (
            shown.hits.map((hit) => (
              <li key={hit.id}>
                <button
                  type="button"
                  onClick={() => onSelect(hit)}
                  className="hover:bg-surface-hover w-full px-3 py-2 text-left"
                >
                  <span className="block text-sm font-medium">
                    {hit.firstName} {hit.lastName}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {hit.phone} · {hit.email}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function NewCustomerFields({
  value,
  onChange,
}: {
  value: NewCustomer;
  onChange: (value: NewCustomer) => void;
}) {
  const { t } = useI18n();
  const set = (key: keyof NewCustomer) => (next: string) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field
        id="booking-first-name"
        label={t("booking.firstName")}
        value={value.firstName}
        onChange={set("firstName")}
        required
      />
      <Field
        id="booking-last-name"
        label={t("admin.lastNameOptional")}
        value={value.lastName}
        onChange={set("lastName")}
      />
      <Field
        id="booking-phone"
        label={t("admin.phone")}
        type="tel"
        value={value.phone}
        onChange={set("phone")}
        required
      />
      <Field
        id="booking-email"
        label={t("admin.emailOptional")}
        type="email"
        value={value.email}
        onChange={set("email")}
      />
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  ...input
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<"input">, "id" | "value" | "onChange">) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        {...input}
      />
    </div>
  );
}
