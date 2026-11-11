import { describe, expect, it, vi } from "vitest";

// errorMessage lives in a server-only module and reads the locale cookie;
// neither exists outside a request, so both are stood in for here.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/i18n/server", async () => {
  const { dictionaries } = await import("@/lib/i18n/translations");
  return { getI18n: async () => ({ dictionary: dictionaries.en }) };
});

import { notFound, redirect } from "next/navigation";
import { ConflictError } from "@/lib/errors";
import { errorMessage } from "@/lib/errors-i18n";
import { dictionaries, translate } from "@/lib/i18n/translations";

/** What a Next control-flow helper throws, caught the way an action's try would. */
function thrownBy(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected it to throw");
}

describe("errorMessage", () => {
  it("rethrows the sign-in redirect instead of turning it into a message", async () => {
    const signIn = thrownBy(() => redirect("/login"));
    await expect(errorMessage(signIn)).rejects.toBe(signIn);
  });

  it("rethrows notFound()", async () => {
    const missing = thrownBy(() => notFound());
    await expect(errorMessage(missing)).rejects.toBe(missing);
  });

  it("still reads a named application error in the operator's language", async () => {
    const error = new ConflictError("Vehicle is already booked", {
      key: "err.alreadyBooked",
    });
    await expect(errorMessage(error)).resolves.toBe(
      translate(dictionaries.en, "err.alreadyBooked")
    );
  });

  it("keeps an unexpected error's details out of the message", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      errorMessage(new Error("connection to db.internal:5432 refused"))
    ).resolves.toBe("An unexpected error occurred");
    quiet.mockRestore();
  });
});
