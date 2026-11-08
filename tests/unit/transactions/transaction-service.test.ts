import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/errors";

const repository = vi.hoisted(() => ({
  createTransactionRecord: vi.fn(),
  deleteTransactionRecord: vi.fn(),
  getTransactionRecord: vi.fn(),
  listCurrentMonthTransactionRecords: vi.fn(),
  resolveTransactionCategoryId: vi.fn(),
  updateTransactionRecord: vi.fn(),
}));

vi.mock("@/features/transactions/transaction.repository", () => repository);

import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listCurrentMonthTransactions,
  updateTransaction,
} from "@/features/transactions/transaction.service";

const transactionId = "0e8c879f-fc71-42ba-b61e-ecb2c3f5d01a";
const categoryId = "571d4f42-62a8-4578-9d8b-22e80b0ca6f3";
const fallbackCategoryId = "ea036f11-7c53-4927-a03e-e9ba3a2c83f3";
const transactionRecord = {
  id: transactionId,
  userId: "owner-a",
  categoryId,
  kind: "expense" as const,
  amount: -9_007_199_254_740_993n,
  occurredOn: "2026-11-06",
  description: "Điều chỉnh",
  createdAt: new Date("2026-11-06T00:00:00.000Z"),
  updatedAt: new Date("2026-11-06T00:00:00.000Z"),
};
const input = {
  categoryId,
  kind: "expense",
  amount: "-9007199254740993",
  occurredOn: "2026-11-06",
  description: "Điều chỉnh",
};

describe("transaction service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    repository.resolveTransactionCategoryId.mockResolvedValue(categoryId);
    repository.createTransactionRecord.mockResolvedValue(transactionRecord);
    repository.getTransactionRecord.mockResolvedValue(transactionRecord);
    repository.listCurrentMonthTransactionRecords.mockResolvedValue([
      transactionRecord,
    ]);
    repository.updateTransactionRecord.mockResolvedValue(transactionRecord);
    repository.deleteTransactionRecord.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates an exact signed transaction for the authenticated owner and matching category", async () => {
    const result = await createTransaction("owner-a", input);

    expect(repository.resolveTransactionCategoryId).toHaveBeenCalledWith(
      "owner-a",
      categoryId,
      "expense",
    );
    expect(repository.createTransactionRecord).toHaveBeenCalledWith(
      "owner-a",
      expect.objectContaining({
        categoryId,
        kind: "expense",
        amount: -9_007_199_254_740_993n,
      }),
    );
    expect(result.amount).toBe("-9007199254740993");
    expect(result.userId).toBe("owner-a");
  });

  it("uses the matching kind's Khác category when no specific category applies", async () => {
    repository.resolveTransactionCategoryId.mockResolvedValue(
      fallbackCategoryId,
    );

    await createTransaction("owner-a", {
      ...input,
      categoryId: null,
      kind: "income",
      amount: "12",
    });

    expect(repository.resolveTransactionCategoryId).toHaveBeenCalledWith(
      "owner-a",
      null,
      "income",
    );
    expect(repository.createTransactionRecord).toHaveBeenCalledWith(
      "owner-a",
      expect.objectContaining({
        categoryId: fallbackCategoryId,
        kind: "income",
        amount: 12n,
      }),
    );
  });

  it("rejects a category that does not match the transaction kind", async () => {
    repository.resolveTransactionCategoryId.mockResolvedValue(null);

    await expect(
      createTransaction("owner-a", { ...input, kind: "income" }),
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      fields: [expect.objectContaining({ field: "categoryId" })],
    });
    expect(repository.createTransactionRecord).not.toHaveBeenCalled();
  });

  it("reads and lists only user-scoped records for the selected calendar month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00.000Z"));

    expect(await getTransaction("owner-a", transactionId)).toMatchObject({
      id: transactionId,
      amount: "-9007199254740993",
    });
    expect(await listCurrentMonthTransactions("owner-a")).toMatchObject([
      { id: transactionId, userId: "owner-a" },
    ]);
    expect(repository.getTransactionRecord).toHaveBeenCalledWith(
      "owner-a",
      transactionId,
    );
    expect(repository.listCurrentMonthTransactionRecords).toHaveBeenCalledWith(
      "owner-a",
      "2026-11",
    );
  });

  it("updates with a matching category and exact signed amount", async () => {
    await updateTransaction("owner-a", transactionId, {
      ...input,
      amount: "3",
    });

    expect(repository.resolveTransactionCategoryId).toHaveBeenCalledWith(
      "owner-a",
      categoryId,
      "expense",
    );
    expect(repository.updateTransactionRecord).toHaveBeenCalledWith(
      "owner-a",
      transactionId,
      expect.objectContaining({ amount: 3n, categoryId }),
    );
  });

  it("rejects missing, out-of-scope, or debt-payment-linked records", async () => {
    repository.getTransactionRecord.mockResolvedValue(null);
    await expect(
      getTransaction("owner-b", transactionId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.updateTransactionRecord.mockResolvedValue(null);
    await expect(
      updateTransaction("owner-b", transactionId, input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    repository.deleteTransactionRecord.mockRejectedValue(
      new DomainError("CONFLICT"),
    );
    await expect(
      deleteTransaction("owner-a", transactionId),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects invalid IDs and update category-kind mismatches", async () => {
    await expect(getTransaction("owner-a", "bad-id")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });

    repository.resolveTransactionCategoryId.mockResolvedValue(null);
    await expect(
      updateTransaction("owner-a", transactionId, {
        ...input,
        kind: "income",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repository.updateTransactionRecord).not.toHaveBeenCalled();
  });

  it("deletes only an owned unlinked transaction", async () => {
    await deleteTransaction("owner-a", transactionId);

    expect(repository.deleteTransactionRecord).toHaveBeenCalledWith(
      "owner-a",
      transactionId,
    );
  });
});
