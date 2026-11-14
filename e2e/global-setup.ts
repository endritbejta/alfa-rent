import { SMOKE_DATA_ENV, seedSmokeData } from "./fixtures/smoke-data";

/**
 * Seeds the run's car and staff account. Variables set on process.env here
 * reach the test workers, which is how the generated password travels
 * without touching the disk.
 */
export default async function globalSetup() {
  const data = await seedSmokeData();
  process.env[SMOKE_DATA_ENV] = JSON.stringify(data);
}
