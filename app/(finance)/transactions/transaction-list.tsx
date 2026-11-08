"use client";

import { useActionState, useCallback, useState } from "react";
import type { TransactionDto } from "@/features/transactions/transaction.service";
import type { ActionState } from "@/features/shared/action-state";
import { deleteTransactionAction } from "./actions";
import { TransactionForm, type TransactionCategory } from "./transaction-form";

const currency = new Intl.NumberFormat("vi-VN");
const initialState: ActionState = {};

function formatVnd(amount: string): string {
  return `${currency.format(BigInt(amount))} ₫`;
}

function TransactionDeleteForm({
  transactionId,
}: Readonly<{ transactionId: string }>) {
  const [state, formAction, pending] = useActionState(
    deleteTransactionAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("Bạn có chắc muốn xóa giao dịch này không?")) {
          event.preventDefault();
        }
      }}
    >
      <input name="transactionId" type="hidden" value={transactionId} />
      <button
        className="transaction-action-button transaction-action-button--danger"
        disabled={pending}
        type="submit"
      >
        {pending ? "Đang xóa…" : "Xóa"}
      </button>
      {state.error ? (
        <p className="error-message" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function TransactionList({
  categories,
  categoryNames,
  transactions,
  today,
}: Readonly<{
  categories: readonly TransactionCategory[];
  categoryNames: ReadonlyMap<string, string>;
  transactions: readonly TransactionDto[];
  today: string;
}>) {
  const [editingTransactionId, setEditingTransactionId] = useState<
    string | null
  >(null);
  const [updatedMessage, setUpdatedMessage] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const onUpdateSuccess = useCallback((id: string, message: string) => {
    setEditingTransactionId(null);
    setUpdatedMessage({ id, message });
  }, []);

  if (transactions.length === 0) {
    return (
      <p className="empty-state">
        Tháng này chưa có giao dịch. Hãy thêm giao dịch đầu tiên ở biểu mẫu bên
        trên.
      </p>
    );
  }

  return (
    <ul className="transaction-list">
      {transactions.map((transaction) => (
        <li className="transaction-card" key={transaction.id}>
          <div className="transaction-card-heading">
            <div className="transaction-card-description">
              <h3>{transaction.description || "Không có mô tả"}</h3>
              <p className="muted">
                {transaction.kind === "income" ? "Thu nhập" : "Chi tiêu"}
                {" · "}
                {categoryNames.get(transaction.categoryId) ?? "Danh mục"}
                {" · "}
                {transaction.occurredOn}
              </p>
            </div>
            <p
              className={`transaction-amount transaction-amount--${transaction.kind}`}
            >
              {formatVnd(transaction.amount)}
            </p>
            {transaction.isDebtPayment ? (
              <span className="transaction-readonly">
                Thanh toán nợ · chỉ xem
              </span>
            ) : (
              <div className="transaction-actions">
                <button
                  aria-expanded={editingTransactionId === transaction.id}
                  className="transaction-action-button"
                  onClick={() =>
                    setEditingTransactionId((current) =>
                      current === transaction.id ? null : transaction.id,
                    )
                  }
                  type="button"
                >
                  {editingTransactionId === transaction.id ? "Đóng" : "Sửa"}
                </button>
                <TransactionDeleteForm transactionId={transaction.id} />
              </div>
            )}
          </div>
          {updatedMessage?.id === transaction.id ? (
            <p className="success-message" role="status">
              {updatedMessage.message}
            </p>
          ) : null}
          {editingTransactionId === transaction.id ? (
            <div className="transaction-editor">
              <h4>Chỉnh sửa giao dịch</h4>
              <TransactionForm
                categories={categories}
                onSuccess={onUpdateSuccess}
                today={today}
                transaction={transaction}
              />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
