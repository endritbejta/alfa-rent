type VehicleIdentity = {
  brand: string;
  model: string;
  plate?: string | null;
  year?: number;
};

/**
 * One naming rule for the whole app. The fleet holds several identical
 * models, so a name alone is ambiguous — the plate disambiguates, with the
 * production year as the fallback for vehicles that have no plate yet.
 */
export function vehicleLabel(vehicle: VehicleIdentity): string {
  const base = `${vehicle.brand} ${vehicle.model}`;
  if (vehicle.plate) return `${base} · ${vehicle.plate}`;
  return vehicle.year ? `${base} (${vehicle.year})` : base;
}

/** Plate when known, year otherwise — for compact secondary lines. */
export function vehicleIdentifier(vehicle: VehicleIdentity): string {
  return vehicle.plate ?? (vehicle.year ? String(vehicle.year) : "");
}
