import { describe, expect, it } from "vitest";
import { calendarBar, calendarWindow } from "./calendar-window";

const day = (key: string) => new Date(`${key}T10:00:00.000Z`);

describe("the calendar window", () => {
  it("runs from one month back to twelve ahead of today", () => {
    const w = calendarWindow(new Date("2026-11-12T09:00:00.000Z"));
    expect(w.days[0]).toBe("2026-10-01");
    expect(w.days[w.days.length - 1]).toBe("2027-11-30");
    expect(w.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2027-12-01T00:00:00.000Z");
    expect(w.months.map((m) => m.key)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
      "2027-09",
      "2027-10",
      "2027-11",
    ]);
    expect(w.days[w.todayIndex]).toBe("2026-11-12");
  });

  it("lays months out contiguously, leap years included", () => {
    const w = calendarWindow(new Date("2028-02-10T09:00:00.000Z"));
    expect(w.months[0]).toEqual({ key: "2028-01", start: 0, days: 31 });
    expect(w.months[1]).toEqual({ key: "2028-02", start: 31, days: 29 });
    const last = w.months[w.months.length - 1];
    expect(last.start + last.days).toBe(w.days.length);
  });

  it("takes today from the business day, not the server's UTC date", () => {
    // 00:30 on 1 December in Belgrade, still 30 November in UTC.
    const w = calendarWindow(new Date("2026-11-30T23:30:00.000Z"));
    expect(w.days[w.todayIndex]).toBe("2026-12-01");
    expect(w.days[0]).toBe("2026-11-01");
  });

  it("keeps today inside the window whatever date it is", () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2029, 0, 1); t += 7.3e7) {
      const w = calendarWindow(new Date(t));
      expect(w.todayIndex).toBeGreaterThanOrEqual(0);
      expect(w.todayIndex).toBeLessThan(w.days.length);
    }
  });
});

describe("a calendar bar", () => {
  const now = new Date("2026-11-12T09:00:00.000Z");
  const w = calendarWindow(now);
  const index = (key: string) => w.days.indexOf(key);

  it("covers pickup day pickup day through return day, both included", () => {
    expect(
      calendarBar(
        {
          status: "CONFIRMED",
          pickupDate: day("2026-11-20"),
          returnDate: day("2026-11-23"),
        },
        w
      )
    ).toEqual({ start: index("2026-11-20"), span: 4 });
  });

  it("is absent for a request twenty months old", () => {
    expect(
      calendarBar(
        {
          status: "PENDING",
          pickupDate: day("2025-03-10"),
          returnDate: day("2025-03-14"),
        },
        w
      )
    ).toBeNull();
  });

  it("does not move the window for a request twenty months old", () => {
    // The old page anchored the window on the oldest open reservation and
    // capped it at fourteen months, which ended it before today.
    expect(w.days[w.todayIndex]).toBe("2026-11-12");
  });

  it("keeps an overdue rental visible, from the window's start to today", () => {
    expect(
      calendarBar(
        {
          status: "ACTIVE",
          pickupDate: day("2025-03-10"),
          returnDate: day("2025-03-14"),
        },
        w
      )
    ).toEqual({ start: 0, span: w.todayIndex + 1 });
  });

  it("runs an active rental through today on its return day", () => {
    expect(
      calendarBar(
        {
          status: "ACTIVE",
          pickupDate: day("2026-11-10"),
          returnDate: day("2026-11-12"),
        },
        w
      )
    ).toEqual({ start: index("2026-11-10"), span: 3 });
  });

  it("clamps a booking that runs past the window's end", () => {
    expect(
      calendarBar(
        {
          status: "CONFIRMED",
          pickupDate: day("2027-11-28"),
          returnDate: day("2028-01-05"),
        },
        w
      )
    ).toEqual({ start: index("2027-11-28"), span: 3 });
  });

  it("is absent for a booking that starts after the window", () => {
    expect(
      calendarBar(
        {
          status: "CONFIRMED",
          pickupDate: day("2027-12-02"),
          returnDate: day("2027-12-05"),
        },
        w
      )
    ).toBeNull();
  });
});
