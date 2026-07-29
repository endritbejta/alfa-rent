import type { Locale } from "./config";

type LocalizedVehicleDescription = {
  brand: string;
  model: string;
  description: string;
};

const ALBANIAN_DESCRIPTIONS: Record<string, string> = {
  "Practical and dependable, ideal for short trips around town.":
    "Praktike dhe e besueshme, ideale për udhëtime të shkurtra nëpër qytet.",
};

export function getVehicleDescription(
  vehicle: LocalizedVehicleDescription,
  locale: Locale
): string {
  if (locale === "en") return vehicle.description;
  return (
    ALBANIAN_DESCRIPTIONS[vehicle.description] ??
    `${vehicle.brand} ${vehicle.model} është një zgjedhje praktike, e rehatshme dhe e besueshme për udhëtimet tuaja.`
  );
}
