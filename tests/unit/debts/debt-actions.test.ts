import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/errors";

const auth = vi.hoisted(() => ({ requireUserId: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const service = vi.hoisted(() => ({
  createDebt: vi.fn(),
  deleteDebt: vi.fn(),
  updateDebt: vi.fn(),
}));

vi.mock("@/lib/dal", () => auth);
vi.mock("next/cache", () => cache);
vi.mock("@/features/debts/debt.service", () => service);

import {
  createDebtAction,
  deleteDebtAction,
  updateDebtAction,
} from "../../../app/(finance)/debts/actions";

const debtId = "0e8c879f-fc71-42ba-b61e-ecb2c3f5d01a";

function formData(overrides: Readonly<Record<string, string>> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    borrowerName: "Ngân hàng giả lập",
    loanType: "Vay giả lập",
    balanceAsOf: "2026-11-05",
    balanceAmount: "9007199254740993",
    dueDate: "2026-12-01",
    principalDuePerPeriod: "9007199254740993",
    interestDuePerPeriod: "123",
    paymentDuePerPeriod: "9007199254741116",
    finalPeriod: "",
    ...overrides,
  })) {
    form.set(key, value);
  }
  return form;
}

describe("debt server actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.requireUserId.mockResolvedValue("authenticated-owner");
    service.createDebt.mockResolvedValue({});
    service.deleteDebt.mockResolvedValue(undefined);
    service.updateDebt.mockResolvedValue({});
  });

  it("creates using the authenticated owner and revalidates debt and dashboard", async () => {
    const result = await createDebtAction({}, formData());

    expect(result.success).toBe("Đã thêm khoản nợ.");
    expect(auth.requireUserId).toHaveBeenCalledOnce();
    expect(service.createDebt).toHaveBeenCalledWith(
      "authenticated-owner",
      expect.objectContaining({
        borrowerName: "Ngân hàng giả lập",
        balanceAmount: "9007199254740993",
      }),
    );
    expect(cache.revalidatePath).toHaveBeenNthCalledWith(1, "/debts");
    expect(cache.revalidatePath).toHaveBeenNthCalledWith(2, "/dashboard");
  });

  it("updates by debt id and revalidates committed dashboard data", async () => {
    const result = await updateDebtAction({}, formData({ debtId }));

    expect(result.success).toBe("Đã cập nhật khoản nợ.");
    expect(service.updateDebt).toHaveBeenCalledWith(
      "authenticated-owner",
      debtId,
      expect.objectContaining({ paymentDuePerPeriod: "9007199254741116" }),
    );
    expect(cache.revalidatePath).toHaveBeenNthCalledWith(1, "/debts");
    expect(cache.revalidatePath).toHaveBeenNthCalledWith(2, "/dashboard");
  });

  it("deletes only for the authenticated owner and revalidates the active list", async () => {
    const result = await deleteDebtAction({}, formData({ debtId }));

    expect(result.success).toBe("Đã xóa khoản nợ khỏi danh sách theo dõi.");
    expect(service.deleteDebt).toHaveBeenCalledWith(
      "authenticated-owner",
      debtId,
    );
    expect(cache.revalidatePath).toHaveBeenNthCalledWith(1, "/debts");
    expect(cache.revalidatePath).toHaveBeenNthCalledWith(2, "/dashboard");
  });

  it("shows a domain error instead of reporting an unsettled debt as deleted", async () => {
    service.deleteDebt.mockRejectedValue(new DomainError("CONFLICT"));

    const result = await deleteDebtAction({}, formData({ debtId }));

    expect(result).toEqual({
      error: "Chỉ có thể xóa khoản nợ đã tất toán.",
    });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
