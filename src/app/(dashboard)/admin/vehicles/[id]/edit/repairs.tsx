"use client";

import { useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Wrench } from "lucide-react";
import { addRepairAction, deleteRepairAction } from "../../actions";
import { DateField } from "@/components/forms/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/components/shared/locale-provider";
import { enUS, sq } from "date-fns/locale";

type Repair = {
  id: string;
  date: Date;
  cost: string;
  description: string;
  notes: string | null;
  reference: string | null;
};

type Stats = {
  totalCost: number;
  count: number;
  countThisYear: number;
  costThisYear: number;
  countThisMonth: number;
  costThisMonth: number;
  averageCost: number;
};

const eur = (n: number) =>
  `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} EUR`;

/**
 * Repairs are unplanned costs, deliberately separate from routine service:
 * the yearly total is what tells staff a vehicle is becoming a money pit.
 */
export function RepairsPanel({
  vehicleId,
  repairs,
  stats,
}: {
  vehicleId: string;
  repairs: Repair[];
  stats: Stats;
}) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const repairFieldsRef = useRef<HTMLDivElement>(null);

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await addRepairAction(vehicleId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  };

  const submitFields = () => {
    const fields = Array.from(
      repairFieldsRef.current?.querySelectorAll<HTMLInputElement>(
        "input[name]"
      ) ?? []
    );
    const invalidField = fields.find(
      (field) => field.required && !field.value.trim()
    );
    if (invalidField) {
      setError(t("admin.requiredField"));
      return;
    }

    const formData = new FormData();
    fields.forEach((field) => formData.set(field.name, field.value));
    submit(formData);
  };

  const summary = [
    {
      label: t("admin.lifetime"),
      value: eur(stats.totalCost),
      hint: t("admin.repairCount", { count: stats.count }),
    },
    {
      label: t("admin.thisYear"),
      value: eur(stats.costThisYear),
      hint: t("admin.repairCount", { count: stats.countThisYear }),
    },
    {
      label: t("admin.thisMonth"),
      value: eur(stats.costThisMonth),
      hint: t("admin.repairCount", { count: stats.countThisMonth }),
    },
    {
      label: t("admin.average"),
      value: eur(stats.averageCost),
      hint: t("admin.perRepair"),
    },
  ];

  return (
    <section
      className="bg-card rounded-xl border p-5 shadow-xs"
      onChange={(event) => event.stopPropagation()}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display flex items-center gap-2 text-sm font-bold">
            <Wrench className="text-brand h-4 w-4" />
            {t("admin.repairsTitle")}
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t("admin.repairsSubtitle")}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="h-4 w-4" />
          {t("admin.addRepair")}
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="bg-secondary rounded-lg border p-3">
            <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
              {s.label}
            </p>
            <p className="font-display mt-0.5 text-lg font-bold tabular-nums">
              {s.value}
            </p>
            <p className="text-muted-foreground text-[11px]">{s.hint}</p>
          </div>
        ))}
      </div>

      {open && (
        <div
          ref={repairFieldsRef}
          className="bg-secondary mb-5 space-y-3 rounded-lg border p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date">{t("admin.date")}</Label>
              {/* Required, so no clear: an empty date has no meaning here. */}
              <DateField
                id="date"
                name="date"
                defaultValue={new Date()}
                clearable={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost">{t("admin.cost")}</Label>
              <Input
                id="cost"
                name="cost"
                type="number"
                step="0.01"
                min={1}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">{t("admin.workDone")}</Label>
            <Input
              id="description"
              name="description"
              required
              placeholder={t("admin.workPlaceholder")}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reference">{t("admin.invoiceReference")}</Label>
              <Input id="reference" name="reference" placeholder="INV-1234" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">{t("admin.notes")}</Label>
              <Input
                id="notes"
                name="notes"
                placeholder={t("admin.partsPlaceholder")}
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            variant="success"
            disabled={pending}
            onClick={submitFields}
          >
            {pending ? t("admin.saving") : t("admin.saveRepair")}
          </Button>
        </div>
      )}

      {repairs.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          {t("admin.noRepairs")}
        </p>
      ) : (
        <ul className="divide-y">
          {repairs.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.description}</p>
                <p className="text-muted-foreground text-xs">
                  {format(new Date(r.date), "dd MMM yyyy", {
                    locale: dateLocale,
                  })}
                  {r.reference && ` - ${r.reference}`}
                  {r.notes && ` - ${r.notes}`}
                </p>
              </div>
              <p className="font-display text-sm font-bold tabular-nums">
                {eur(Number(r.cost))}
              </p>
              <button
                type="button"
                aria-label={t("admin.deleteRepair")}
                className="text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteRepairAction(vehicleId, r.id);
                    if (result?.error) setError(result.error);
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
