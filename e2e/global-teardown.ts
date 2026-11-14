import {
  SMOKE_DATA_ENV,
  removeSmokeData,
  type SmokeData,
} from "./fixtures/smoke-data";

export default async function globalTeardown() {
  const raw = process.env[SMOKE_DATA_ENV];
  if (!raw) return;
  // E2E_KEEP_DATA=1 leaves the rows in place to look at after a failure.
  if (process.env.E2E_KEEP_DATA) return;
  await removeSmokeData(JSON.parse(raw) as SmokeData);
}
