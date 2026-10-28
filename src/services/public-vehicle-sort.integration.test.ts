import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// unstable_cache needs Next's runtime; outside it, run the query directly.
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

const { prisma } = await import("@/lib/db/prisma");
const { getPublicVehicles } = await import("@/services/vehicle.service");

/**
 * The storefront's sort control. The public list hard-coded "newest", so
 * choosing "price: low to high" changed the URL and nothing else, a bug
 * that reached production because the admin list, which did sort, was the
 * only one under test.
 */
const tag = `sortcheck${randomUUID().slice(0, 6)}`;
const prices = [80, 20, 50];
const ids = prices.map((_, i) => `${tag}-${i}`);

beforeAll(async () => {
  await prisma.vehicle.createMany({
    data: prices.map((pricePerDay, i) => ({
      id: ids[i]!,
      slug: ids[i]!,
      // One unique brand so a search isolates these three cars.
      brand: tag,
      model: `Model ${i}`,
      year: 2025,
      category: "SEDAN" as const,
      transmission: "AUTOMATIC" as const,
      fuelType: "PETROL" as const,
      seats: 5,
      pricePerDay,
      description: "Integration-test vehicle for public sorting.",
      status: "AVAILABLE" as const,
      // Created in listing order, so "newest" is the reverse of insertion.
      createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
    })),
  });
});

afterAll(async () => {
  await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const pricesFor = async (sort?: "newest" | "price-asc" | "price-desc") => {
  const page = await getPublicVehicles({ q: tag, sort, page: 1, perPage: 10 });
  return page.items.map((vehicle) => vehicle.pricePerDay);
};

describe("public fleet sorting", () => {
  it("sorts by price, low to high", async () => {
    expect(await pricesFor("price-asc")).toEqual([20, 50, 80]);
  });

  it("sorts by price, high to low", async () => {
    expect(await pricesFor("price-desc")).toEqual([80, 50, 20]);
  });

  it("lists the newest first by default", async () => {
    expect(await pricesFor()).toEqual([50, 20, 80]);
  });
});
