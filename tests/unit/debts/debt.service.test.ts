import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/errors";

const repositories = vi.hoisted(() => ({
  createDebtRecord: vi.fn(),
  deleteDebtRecord: vi.fn(),
  listDebtRecords: vi.fn(),
  updateDebtRecord: vi.fn(),
}));

vi.mock("@/features/debts/debt.repository", () => repositories);

import {
  createDebt,
  deleteDebt,
  listDebts,
  updateDebt,
} from "@/features/debts/debt.service";

const debtId = "0e8c879f-fc71-42ba-b61e-ecb2c3f5d01a";
const record = {
  id: debtId,
  userId: "user-a",
  borrowerName: "Ngân hàng giả lập",
  loanType: "Vay giả lập",
  balanceAsOf: "2026-11-05",
  balanceAmount: 9_007_199_254_740_993n,
  dueDate: "2026-12-01",
  principalDuePerPeriod: 2n,
  interestDuePerPeriod: 1n,
  paymentDuePerPeriod: 3n,
  finalPeriod: null,
  createdAt: new Date("2026-11-05T00:00:00.000Z"),
  updatedAt: new Date("2026-11-05T00:00:00.000Z"),
};
const input = {
  borrowerName: record.borrowerName,
  loanType: record.loanType,
  balanceAsOf: record.balanceAsOf,
  balanceAmount: "9007199254740993",
  dueDate: record.dueDate,
  principalDuePerPeriod: "2",
  interestDuePerPeriod: "1",
  paymentDuePerPeriod: "3",
  finalPeriod: null,
};

describe("debt service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates user-scoped records and serializes amounts as exact strings", async () => {
    repositories.createDebtRecord.mockResolvedValue(record);

    const created = await createDebt("user-a", input);

    expect(repositories.createDebtRecord).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ balanceAmount: 9_007_199_254_740_993n }),
    );
    expect(created.balanceAmount).toBe("9007199254740993");
    expect(created.paymentDuePerPeriod).toBe("3");
  });

  it("lists only the requested user's records", async () => {
    repositories.listDebtRecords.mockResolvedValue([record]);

    const debts = await listDebts("user-a");

    expect(repositories.listDebtRecords).toHaveBeenCalledWith("user-a");
    expect(debts.map((item) => item.id)).toEqual([debtId]);
  });

  it("updates and deletes by both user and debt identifier", async () => {
    repositories.updateDebtRecord.mockResolvedValue(record);
    repositories.deleteDebtRecord.mockResolvedValue(true);

    await updateDebt("user-a", debtId, input);
    await deleteDebt("user-a", debtId);

    expect(repositories.updateDebtRecord).toHaveBeenCalledWith(
      "user-a",
      debtId,
      expect.objectContaining({ balanceAmount: 9_007_199_254_740_993n }),
    );
    expect(repositories.deleteDebtRecord).toHaveBeenCalledWith(
      "user-a",
      debtId,
    );
  });

  it("reports missing or out-of-scope records as not found", async () => {
    repositories.updateDebtRecord.mockResolvedValue(null);
    repositories.deleteDebtRecord.mockResolvedValue(false);

    await expect(updateDebt("user-b", debtId, input)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(deleteDebt("user-b", debtId)).rejects.toBeInstanceOf(
      DomainError,
    );
  });
});
