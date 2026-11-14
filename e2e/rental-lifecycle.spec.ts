import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { smokeData } from "./fixtures/smoke-data";

/**
 * One booking through its whole life, driven only through the pages:
 * storefront → booking request → staff sign-in → confirm → pickup
 * inspection → return inspection.
 *
 * AGENTS.md's "verify through the page" rule as a test: a service-level test
 * once passed while the fleet filters were dead, because the bug was in the
 * page. Locators are by role and label, in English (the locale cookie below);
 * Albanian is the default and is covered by the translation tests.
 *
 * The booking form is filled the way a person fills it, and sent only after
 * the page has been open for longer than the bot check's minimum fill time,
 * so the honeypot and timing defences are exercised rather than bypassed.
 */
const MIN_HUMAN_FILL_MS = 4_000;

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    { name: "alfa-locale", value: "en", url: baseURL! },
  ]);
  // A print dialog cannot be driven headless. Every frame's print() instead
  // records, in the top window, which sheet it was called on — so starting
  // and completing a rental are seen to print the right one, and only once.
  await context.addInitScript(() => {
    type Printed = { path: string; sheet: string | null; type: string | null };
    const top = window.top as Window & { __printed?: Printed[] };
    if (window === top) top.__printed = [];
    window.print = () => {
      const sheet = document.querySelector<HTMLElement>("[data-print-sheet]");
      top.__printed?.push({
        path: location.pathname + location.search,
        sheet: sheet?.dataset.printSheet ?? null,
        type: sheet?.dataset.printType ?? null,
      });
    };
  });
});

/** The print() calls recorded on this page since it loaded. */
function printed(page: Page) {
  return page.evaluate(
    () =>
      (window as Window & { __printed?: unknown[] }).__printed?.slice() ?? []
  );
}

/** Picks today in the calendar a date trigger opens. */
async function pickToday(page: Page, trigger: RegExp) {
  await page.getByRole("button", { name: trigger }).click();
  const grid = page.getByRole("grid");
  await grid.getByRole("button", { name: /^Today/ }).click();
  await expect(grid).toBeHidden();
}

test("a booking request goes from the storefront to a completed rental", async ({
  page,
}) => {
  const data = smokeData();
  const customerName = `${data.customer.firstName} ${data.customer.lastName}`;

  // --- Storefront ------------------------------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The car's own page. Its slug is new this run, so no cached fleet list
  // stands between the seed and the page.
  await page.goto(`/car/${data.vehicle.slug}`);
  await expect(
    page.getByRole("heading", { level: 1, name: data.vehicle.label })
  ).toBeVisible();

  // A same-day rental: pickup and return today, so staff can start it today
  // and complete it on its own return day, with no late or early billing.
  await pickToday(page, /Pickup date/);
  await pickToday(page, /Return date/);
  await expect(page.getByText("Available for your dates")).toBeVisible();
  await page.getByRole("button", { name: "Continue to booking" }).click();

  // --- Booking form ----------------------------------------------------
  await expect(page).toHaveURL(/\/booking\?/);
  const formOpenedAt = Date.now();
  await page.getByLabel("First name").fill(data.customer.firstName);
  await page.getByLabel("Last name").fill(data.customer.lastName);
  await page.getByLabel("Email").fill(data.customer.email);
  await page.getByLabel("Phone").fill(data.customer.phone);
  const elapsed = Date.now() - formOpenedAt;
  if (elapsed < MIN_HUMAN_FILL_MS) {
    await page.waitForTimeout(MIN_HUMAN_FILL_MS - elapsed);
  }
  await page.getByRole("button", { name: "Send booking request" }).click();
  await expect(
    page.getByRole("heading", { name: "Request received" })
  ).toBeVisible();

  // --- Staff sign-in ---------------------------------------------------
  await page.goto("/admin/reservations?status=PENDING");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email address").fill(data.admin.email);
  await page.getByLabel("Password", { exact: true }).fill(data.admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Signed in when the admin shell answers. Where it lands is not asserted:
  // the proxy hands /login an absolute callbackUrl, which safeCallbackUrl
  // refuses, so today it is always the dashboard.
  await expect(page).toHaveURL(/\/admin\//);
  await page.goto("/admin/reservations?status=PENDING");

  // --- Confirm ---------------------------------------------------------
  // The request reaching the queue is also the proof the bot check took it
  // for a person: a rejected bot gets the same "received" page, but no row.
  const request = page.getByRole("article").filter({ hasText: customerName });
  await expect(request).toBeVisible();
  await request.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Reservation updated")).toBeVisible();

  // --- Pickup ----------------------------------------------------------
  await page.goto("/admin/reservations?status=CONFIRMED");
  const confirmedRow = page.getByRole("row").filter({ hasText: customerName });
  await confirmedRow.getByRole("button", { name: "Start rental" }).click();
  const pickup = page.getByRole("dialog", { name: "Pickup inspection" });
  await pickup.getByLabel("Mileage (km)").fill("12000");
  await pickup.getByRole("checkbox").last().check();
  await pickup.getByRole("button", { name: "Save and start rental" }).click();
  await expect(pickup).toBeHidden();
  await expect(page.getByText("Inspection recorded")).toBeVisible();
  // Starting prints the pickup sheet by itself, once, from a fresh load.
  await expect
    .poll(() => printed(page))
    .toEqual([
      {
        path: expect.stringMatching(/^\/admin\/print\/handover\/[^/?]+$/),
        sheet: expect.any(String),
        type: "PICKUP",
      },
    ]);
  const [pickupPrint] = (await printed(page)) as { sheet: string }[];

  // --- Return ----------------------------------------------------------
  await page.goto("/admin/reservations?status=ACTIVE");
  const activeRow = page.getByRole("row").filter({ hasText: customerName });
  await activeRow.getByRole("button", { name: "Complete rental" }).click();
  const ret = page.getByRole("dialog", { name: "Return inspection" });
  await ret.getByLabel("Mileage (km)").fill("12150");
  await ret.getByRole("checkbox").last().check();
  await ret.getByRole("button", { name: "Save and complete rental" }).click();
  await expect(ret).toBeHidden();
  await expect(page.getByText("Inspection recorded")).toBeVisible();
  // Completing prints the return sheet of the same reservation.
  await expect
    .poll(() => printed(page))
    .toEqual([
      {
        path: `/admin/print/handover/${pickupPrint!.sheet}?type=return`,
        sheet: pickupPrint!.sheet,
        type: "RETURN",
      },
    ]);

  // --- Outcome, on the page and in the database --------------------------
  await page.goto("/admin/reservations?status=COMPLETED");
  await expect(
    page.getByRole("row").filter({ hasText: customerName })
  ).toBeVisible();

  const prisma = new PrismaClient();
  try {
    const reservation = await prisma.reservation.findFirstOrThrow({
      where: { vehicleId: data.vehicle.id },
      select: {
        id: true,
        status: true,
        inspections: { select: { type: true, mileage: true } },
      },
    });
    expect(reservation.status).toBe("COMPLETED");
    // Both sheets printed were this reservation's.
    expect(pickupPrint!.sheet).toBe(reservation.id);
    expect(
      reservation.inspections.map((i) => [i.type, i.mileage]).sort()
    ).toEqual([
      ["PICKUP", 12000],
      ["RETURN", 12150],
    ]);
  } finally {
    await prisma.$disconnect();
  }
});
