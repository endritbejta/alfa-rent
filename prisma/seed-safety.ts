type SeedEnvironment = {
  [key: string]: string | undefined;
  ALLOW_DESTRUCTIVE_SEED?: string;
  SEED_ADMIN_PASSWORD?: string;
  SEED_EMPLOYEE_PASSWORD?: string;
};

export function requireSeedCredentials(env: SeedEnvironment): {
  adminPassword: string;
  employeePassword: string;
} {
  if (env.ALLOW_DESTRUCTIVE_SEED !== "WIPE_AND_RESEED") {
    throw new Error(
      "Refusing to seed: set ALLOW_DESTRUCTIVE_SEED=WIPE_AND_RESEED to acknowledge that all application data will be deleted."
    );
  }

  const adminPassword = env.SEED_ADMIN_PASSWORD?.trim();
  const employeePassword = env.SEED_EMPLOYEE_PASSWORD?.trim();
  if (!adminPassword || adminPassword.length < 16) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is required and must be at least 16 characters."
    );
  }
  if (!employeePassword || employeePassword.length < 16) {
    throw new Error(
      "SEED_EMPLOYEE_PASSWORD is required and must be at least 16 characters."
    );
  }
  if (adminPassword === employeePassword) {
    throw new Error("Seeded staff accounts must not share a password.");
  }

  return { adminPassword, employeePassword };
}
