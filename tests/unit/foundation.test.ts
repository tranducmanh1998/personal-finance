import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { loadFakeSeed } from "../helpers/seed";

describe("foundation", () => {
  it("returns parsed data and reports field-level validation errors", () => {
    const schema = z.object({
      email: z.email(),
    });

    expect(validateInput(schema, { email: "test@example.invalid" })).toEqual({
      email: "test@example.invalid",
    });

    try {
      validateInput(schema, { email: "not-an-email" });
      throw new Error("Expected invalid input to throw.");
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.fields[0]?.field).toBe("email");
    }
  });

  it("loads only deterministic fabricated fixture data", async () => {
    const seed = await loadFakeSeed();

    expect(seed.user.email).toBe("finance-test@example.invalid");
    expect(seed.finance.transactions).toHaveLength(2);
    expect(
      seed.finance.transactions.every((item) => /^\d+$/.test(item.amount)),
    ).toBe(true);
  });
});
