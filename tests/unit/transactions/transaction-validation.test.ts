import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import {
  parseTransactionId,
  parseTransactionInput,
  parseTransactionMonth,
} from "@/features/transactions/transaction.validation";

const maximumBigint = "9223372036854775807";
const minimumBigint = "-9223372036854775808";
const categoryId = "0e8c879f-fc71-42ba-b61e-ecb2c3f5d01a";

function validInput() {
  return {
    categoryId,
    kind: "expense",
    amount: "-9007199254740993",
    occurredOn: "2026-11-06",
    description: "Điều chỉnh kiểm thử",
  };
}

describe("transaction validation", () => {
  it("preserves exact signed integer amounts beyond JavaScript safe integer range", () => {
    expect(parseTransactionInput(validInput()).amount).toBe(
      -9_007_199_254_740_993n,
    );
    expect(
      parseTransactionInput({ ...validInput(), amount: maximumBigint }).amount,
    ).toBe(9_223_372_036_854_775_807n);
    expect(
      parseTransactionInput({ ...validInput(), amount: minimumBigint }).amount,
    ).toBe(-9_223_372_036_854_775_808n);
  });

  it.each([
    "",
    " 1",
    "1.5",
    "+1",
    "9223372036854775808",
    "-9223372036854775809",
  ])("rejects invalid or out-of-range amount: %s", (amount) => {
    expect(() => parseTransactionInput({ ...validInput(), amount })).toThrow(
      DomainError,
    );
  });

  it.each(["2026-02-29", "2026-13-01", "06-11-2026", "2026-1-06"])(
    "rejects invalid calendar date: %s",
    (occurredOn) => {
      expect(() =>
        parseTransactionInput({ ...validInput(), occurredOn }),
      ).toThrow(DomainError);
    },
  );

  it("accepts a real leap day and uses the matching-kind fallback when no category is selected", () => {
    const parsed = parseTransactionInput({
      ...validInput(),
      categoryId: null,
      occurredOn: "2024-02-29",
    });

    expect(parsed.categoryId).toBeNull();
    expect(parsed.kind).toBe("expense");
    expect(parsed.occurredOn).toBe("2024-02-29");
  });

  it("requires a valid transaction category identifier when one is supplied", () => {
    expect(() =>
      parseTransactionInput({ ...validInput(), categoryId: "not-a-uuid" }),
    ).toThrow(DomainError);
    expect(() => parseTransactionId("not-a-uuid")).toThrow(DomainError);
  });

  it("validates a year-month before using it as a current-month range", () => {
    expect(parseTransactionMonth("2026-11")).toBe("2026-11");
    expect(() => parseTransactionMonth("2026-13")).toThrow(DomainError);
  });
});
