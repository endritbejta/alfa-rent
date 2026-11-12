import { describe, expect, it } from "vitest";
import {
  legalFacts,
  legalTextIsDraft,
  missingLegalFacts,
  resolveFact,
} from "./legal-facts";

describe("missingLegalFacts", () => {
  it("lists every fact still to be supplied, by its path", () => {
    expect(
      missingLegalFacts({
        controller: {
          legalName: "Alfa Example SH.P.K.",
          address: { todo: "Registered address" },
        },
        retention: {
          rentalRecords: { sq: "dhjetë vjet", en: "ten years" },
          customerContact: { sq: "", en: "two years" },
        },
        effectiveDate: "   ",
      })
    ).toEqual([
      "controller.address",
      "retention.customerContact",
      "effectiveDate",
    ]);
  });

  it("is empty once everything is supplied", () => {
    expect(
      missingLegalFacts({
        controller: { legalName: "Alfa Example SH.P.K." },
        retention: { rentalRecords: { sq: "dhjetë vjet", en: "ten years" } },
      })
    ).toEqual([]);
  });

  it("marks the pages as a draft exactly while something is missing", () => {
    expect(legalTextIsDraft).toBe(missingLegalFacts(legalFacts).length > 0);
  });
});

describe("resolveFact", () => {
  it("renders nothing for a fact still to be supplied", () => {
    expect(resolveFact({ todo: "Registered address" }, "en")).toBeNull();
  });

  it("picks the reader's language, and keeps neutral facts as they are", () => {
    expect(resolveFact({ sq: "dhjetë vjet", en: "ten years" }, "sq")).toBe(
      "dhjetë vjet"
    );
    expect(resolveFact("privacy@example.test", "en")).toBe(
      "privacy@example.test"
    );
  });
});

/**
 * The guard that stops the privacy notice and the terms going out as if they
 * were final. It fails while any fact in legal-facts.ts is still a todo,
 * which is the state the code ships in until the business and its lawyer
 * supply them, so by default it is skipped: running it unconditionally
 * would fail every `npm test` and every CI run until then.
 *
 * Run it with REQUIRE_FINAL_LEGAL_FACTS=1 before removing the draft status
 * for good; once it passes, the flag can be dropped and the test made
 * unconditional. Until then the pages carry a draft banner on their own, so
 * skipping this cannot make them look final.
 */
describe.runIf(process.env.REQUIRE_FINAL_LEGAL_FACTS === "1")(
  "legal facts (REQUIRE_FINAL_LEGAL_FACTS=1)",
  () => {
    it("has every fact supplied by the business or its lawyer", () => {
      expect(missingLegalFacts()).toEqual([]);
    });
  }
);
