"use client";

import { useState } from "react";
import Link from "next/link";
import type { DebtDto } from "@/features/debts/debt.service";
import { DebtForm } from "./debt-form";
import { DebtDeleteForm } from "./debt-delete-form";

const currency = new Intl.NumberFormat("vi-VN");

function formatVnd(amount: string): string {
  return `${currency.format(BigInt(amount))} ₫`;
}

export function DebtList({
  debts,
  today,
}: Readonly<{ debts: readonly DebtDto[]; today: string }>) {
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);

  if (debts.length === 0) {
    return (
      <p className="empty-state">
        Chưa có khoản nợ. Bạn có thể thêm khoản đầu tiên ở biểu mẫu bên trên.
      </p>
    );
  }

  return (
    <ul className="debt-list">
      {debts.map((debt) => (
        <li className="debt-card" key={debt.id}>
          <div className="debt-card-heading">
            <div>
              <h3>{debt.borrowerName}</h3>
              <p className="muted">{debt.loanType}</p>
            </div>
            <button
              aria-expanded={editingDebtId === debt.id}
              className="secondary-button"
              onClick={() =>
                setEditingDebtId((current) =>
                  current === debt.id ? null : debt.id,
                )
              }
              type="button"
            >
              {editingDebtId === debt.id ? "Đóng biểu mẫu" : "Sửa"}
            </button>
            <Link
              className="secondary-button"
              href={`/debts/${debt.id}/payments`}
            >
              Thanh toán & lịch sử
            </Link>
            <DebtDeleteForm
              debtId={debt.id}
              settled={BigInt(debt.balanceAmount) === 0n}
            />
          </div>
          <dl className="debt-facts">
            <div>
              <dt>Dư nợ tại {debt.balanceAsOf}</dt>
              <dd>{formatVnd(debt.balanceAmount)}</dd>
            </div>
            <div>
              <dt>Ngày đến hạn</dt>
              <dd>{debt.dueDate}</dd>
            </div>
            <div>
              <dt>Gốc / kỳ</dt>
              <dd>{formatVnd(debt.principalDuePerPeriod)}</dd>
            </div>
            <div>
              <dt>Lãi / kỳ</dt>
              <dd>{formatVnd(debt.interestDuePerPeriod)}</dd>
            </div>
            <div>
              <dt>Phải trả / kỳ</dt>
              <dd>{formatVnd(debt.paymentDuePerPeriod)}</dd>
            </div>
            <div>
              <dt>Kỳ cuối cùng</dt>
              <dd>{debt.finalPeriod ?? "Chưa xác định"}</dd>
            </div>
          </dl>
          {editingDebtId === debt.id ? (
            <div className="debt-editor">
              <h4>Chỉnh sửa khoản nợ</h4>
              <DebtForm debt={debt} today={today} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
