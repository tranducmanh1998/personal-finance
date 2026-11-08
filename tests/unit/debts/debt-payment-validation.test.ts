import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { parseDebtPaymentInput } from "@/features/debts/payment.validation";

const validInput = {
  period: "2026-11",
  paidOn: "2026-11-05",
  principalAmount: "9007199254740993",
  interestAmount: "123",
};

describe("debt payment validation", () => {
  it("preserves exact integer amounts and validates the payment period", () => {
    const parsed = parseDebtPaymentInput(validInput);

    expect(parsed.principalAmount).toBe(9_007_199_254_740_993n);
    expect(parsed.interestAmount).toBe(123n);
    expect(parsed.period).toBe("2026-11");
  });

  it("rejects invalid dates, periods, and amounts outside PostgreSQL bigint", () => {
    expect(() =>
      parseDebtPaymentInput({ ...validInput, paidOn: "2026-02-30" }),
    ).toThrow(DomainError);
    expect(() =>
      parseDebtPaymentInput({ ...validInput, period: "2026-13" }),
    ).toThrow(DomainError);
    expect(() =>
      parseDebtPaymentInput({
        ...validInput,
        principalAmount: "9223372036854775808",
      }),
    ).toThrow(DomainError);
  });

  it("rejects a total payment that overflows bigint or is zero", () => {
    expect(() =>
      parseDebtPaymentInput({
        ...validInput,
        principalAmount: "9223372036854775807",
        interestAmount: "1",
      }),
    ).toThrow(DomainError);
    expect(() =>
      parseDebtPaymentInput({
        ...validInput,
        principalAmount: "0",
        interestAmount: "0",
      }),
    ).toThrow(DomainError);
  });
});
