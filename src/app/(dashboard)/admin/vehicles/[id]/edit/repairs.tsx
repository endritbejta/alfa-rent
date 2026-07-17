"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Wrench } from "lucide-react";
import { addRepairAction, deleteRepairAction } from "../../actions";
import { DateField } from "@/components/forms/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const summary = [
    {
      label: "Lifetime",
      value: eur(stats.totalCost),
      hint: `${stats.count} repairs`,
    },
    {
      label: "This year",
      value: eur(stats.costThisYear),
      hint: `${stats.countThisYear} repairs`,
    },
    {
      label: "This month",
      value: eur(stats.costThisMonth),
      hint: `${stats.countThisMonth} repairs`,
    },
    { label: "Average", value: eur(stats.averageCost), hint: "per repair" },
  ];

  return (
    <section className="bg-card max-w-2xl rounded-xl border p-5 shadow-xs">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display flex items-center gap-2 text-sm font-bold">
            <Wrench className="text-brand h-4 w-4" />
            Repairs
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Unplanned costs only — regular servicing is tracked above
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-4 w-4" />
          Add repair
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
        <form
          action={submit}
          className="bg-secondary mb-5 space-y-3 rounded-lg border p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              {/* Required, so no clear: an empty date has no meaning here. */}
              <DateField
                id="date"
                name="date"
                defaultValue={new Date()}
                clearable={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cost">Cost (EUR)</Label>
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
            <Label htmlFor="description">What was done</Label>
            <Input
              id="description"
              name="description"
              required
              placeholder="Brake pads and discs replaced"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reference">Invoice reference</Label>
              <Input id="reference" name="reference" placeholder="INV-1234" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                name="notes"
                placeholder="Parts sourced locally"
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <Button type="submit" size="sm" variant="success" disabled={pending}>
            {pending ? "Saving..." : "Save repair"}
          </Button>
        </form>
      )}

      {repairs.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          No repairs recorded — this one has been trouble-free.
        </p>
      ) : (
        <ul className="divide-y">
          {repairs.map((r) => (
            <li key={r.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.description}</p>
                <p className="text-muted-foreground text-xs">
                  {format(new Date(r.date), "dd MMM yyyy")}
                  {r.reference && ` - ${r.reference}`}
                  {r.notes && ` - ${r.notes}`}
                </p>
              </div>
              <p className="font-display text-sm font-bold tabular-nums">
                {eur(Number(r.cost))}
              </p>
              <button
                type="button"
                aria-label="Delete repair"
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
