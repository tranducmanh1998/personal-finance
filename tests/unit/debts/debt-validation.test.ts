import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { parseDebtInput } from "@/features/debts/debt.validation";

const maximumBigint = "9223372036854775807";

function validDebtInput() {
  return {
    borrowerName: "Ngân hàng giả lập",
    loanType: "Thế chấp",
    balanceAsOf: "2026-11-05",
    balanceAmount: maximumBigint,
    dueDate: "2026-12-01",
    principalDuePerPeriod: "9007199254740993",
    interestDuePerPeriod: "123",
    paymentDuePerPeriod: "9007199254741116",
    finalPeriod: "2030-12-01",
  };
}

describe("debt validation", () => {
  it("preserves exact integer amounts through BigInt serialization", () => {
    const debt = parseDebtInput(validDebtInput());

    expect(debt.balanceAmount.toString()).toBe(maximumBigint);
    expect(debt.principalDuePerPeriod.toString()).toBe("9007199254740993");
    expect(debt.interestDuePerPeriod.toString()).toBe("123");
    expect(debt.paymentDuePerPeriod.toString()).toBe("9007199254741116");
  });

  it("requires debt identity, balance, periodic amounts, and due date", () => {
    const input: Record<string, unknown> = validDebtInput();
    delete input.borrowerName;

    expect(() => parseDebtInput(input)).toThrow(DomainError);
    expect(() =>
      parseDebtInput({ ...validDebtInput(), dueDate: undefined }),
    ).toThrow(DomainError);
    expect(() =>
      parseDebtInput({ ...validDebtInput(), paymentDuePerPeriod: undefined }),
    ).toThrow(DomainError);
  });

  it.each(["-1", "1.5", "9223372036854775808", ""])
  ("rejects invalid or out-of-range exact amounts: %s", (amount) => {
    expect(() =>
      parseDebtInput({ ...validDebtInput(), balanceAmount: amount }),
    ).toThrow(DomainError);
  });

  it.each(["2026-02-29", "2026-13-01", "05-11-2026"])
  ("rejects invalid calendar dates: %s", (date) => {
    expect(() =>
      parseDebtInput({ ...validDebtInput(), balanceAsOf: date }),
    ).toThrow(DomainError);
  });

  it("allows an unknown final period without reconciling payment components", () => {
    const debt = parseDebtInput({
      ...validDebtInput(),
      finalPeriod: null,
      paymentDuePerPeriod: "1",
    });

    expect(debt.finalPeriod).toBeNull();
    expect(debt.paymentDuePerPeriod).toBe(1n);
  });
});
