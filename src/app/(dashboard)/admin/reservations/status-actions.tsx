"use client";

import { useState, useTransition } from "react";
import type { ReservationStatus } from "@prisma/client";
import { updateReservationStatusAction } from "./actions";
import { Button } from "@/components/ui/button";

const NEXT_ACTIONS: Partial<
  Record<
    ReservationStatus,
    { label: string; to: ReservationStatus; destructive?: boolean }[]
  >
> = {
  PENDING: [
    { label: "Confirm", to: "CONFIRMED" },
    { label: "Cancel", to: "CANCELLED", destructive: true },
  ],
  CONFIRMED: [
    { label: "Start rental", to: "ACTIVE" },
    { label: "Cancel", to: "CANCELLED", destructive: true },
  ],
  ACTIVE: [{ label: "Complete", to: "COMPLETED" }],
};

export function StatusActions({
  reservationId,
  status,
}: {
  reservationId: string;
  status: ReservationStatus;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const actions = NEXT_ACTIONS[status] ?? [];

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        {actions.map((action) => (
          <Button
            key={action.to}
            size="sm"
            variant={action.destructive ? "destructive" : "outline"}
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await updateReservationStatusAction(
                  reservationId,
                  action.to
                );
                if (result?.error) setError(result.error);
              });
            }}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
