/**
 * Stand-ins for the Next.js runtime that server-action tests share.
 *
 * Imported only by tests. A vi.mock factory loads this with `await import`,
 * and the test imports it normally; both get the same module, so the
 * Redirected a mocked redirect() throws is the class the test checks for.
 *
 * Kept in one place because the copies drifted: one stubbed unstable_rethrow
 * as a no-op, which let a guard inside an action's try turn its sign-in
 * redirect into an { error } without any test noticing.
 */
import { dictionaries, translate } from "@/lib/i18n/translations";

/** Stands in for Next's NEXT_REDIRECT, carrying where it was sent. */
export class Redirected extends Error {
  constructor(public readonly to: string) {
    super(`redirect to ${to}`);
  }
}

/** For `vi.mock("next/navigation", …)`. */
export function nextNavigationMock() {
  return {
    redirect: (to: string): never => {
      throw new Redirected(to);
    },
    // As Next does: control flow passes through errorMessage() untouched.
    unstable_rethrow: (error: unknown) => {
      if (error instanceof Redirected) throw error;
    },
  };
}

/**
 * For `vi.mock("@/lib/i18n/server", …)`: errorMessage() reads the locale
 * cookie through it, and there is no request in a test. Always English.
 */
export function i18nServerMock() {
  return {
    getI18n: async () => ({
      locale: "en" as const,
      dictionary: dictionaries.en,
      t: (key: Parameters<typeof translate>[1]) =>
        translate(dictionaries.en, key),
    }),
  };
}
