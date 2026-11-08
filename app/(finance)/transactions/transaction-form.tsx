"use client";

import { useActionState, useEffect, useState } from "react";
import type { TransactionDto } from "@/features/transactions/transaction.service";
import type { ActionState } from "@/features/shared/action-state";
import { createTransactionAction, updateTransactionAction } from "./actions";

export type TransactionCategory = Readonly<{
  id: string;
  name: string;
  kind: "income" | "expense";
  isMonthlySavings: boolean;
}>;

const initialState: ActionState = {};
type TransactionAction = (
  previousState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

function ActionMessage({ state }: Readonly<{ state: ActionState }>) {
  if (state.error) {
    return (
      <p className="error-message" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p className="success-message" role="status">
        {state.success}
      </p>
    );
  }
  return null;
}

export function TransactionForm({
  categories,
  today,
  transaction,
  onSuccess,
  createAction,
  submitLabel,
}: Readonly<{
  categories: readonly TransactionCategory[];
  today: string;
  transaction?: TransactionDto;
  onSuccess?: (transactionId: string, message: string) => void;
  createAction?: TransactionAction;
  submitLabel?: string;
}>) {
  const [kind, setKind] = useState<"income" | "expense">(
    transaction?.kind ?? "expense",
  );
  const availableCategories = categories.filter((item) => item.kind === kind);
  const [categoryId, setCategoryId] = useState(
    transaction?.categoryId ?? availableCategories[0]?.id ?? "",
  );
  const selectedCategoryId = availableCategories.some(
    (item) => item.id === categoryId,
  )
    ? categoryId
    : (availableCategories[0]?.id ?? "");
  const action = transaction
    ? updateTransactionAction
    : (createAction ?? createTransactionAction);
  const [state, formAction, pending] = useActionState(action, initialState);
  const transactionId = transaction?.id;

  useEffect(() => {
    if (transactionId && state.success) {
      onSuccess?.(transactionId, state.success);
    }
  }, [onSuccess, state.success, transactionId]);

  return (
    <form action={formAction} className="finance-form transaction-form">
      {transaction ? (
        <input name="transactionId" type="hidden" value={transaction.id} />
      ) : null}
      <label className="form-field">
        <span>Loại giao dịch</span>
        <select
          name="kind"
          onChange={(event) => {
            const nextKind = event.currentTarget.value as "income" | "expense";
            setKind(nextKind);
            setCategoryId(
              categories.find((item) => item.kind === nextKind)?.id ?? "",
            );
          }}
          required
          value={kind}
        >
          <option value="income">Thu nhập</option>
          <option value="expense">Chi tiêu</option>
        </select>
      </label>
      <label className="form-field">
        <span>Danh mục</span>
        <select
          name="categoryId"
          onChange={(event) => setCategoryId(event.currentTarget.value)}
          required={availableCategories.length > 0}
          value={selectedCategoryId}
        >
          {availableCategories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.isMonthlySavings ? " · Tiết kiệm tháng" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>Số tiền (₫)</span>
        <input
          autoComplete="off"
          defaultValue={transaction?.amount ?? ""}
          inputMode="numeric"
          name="amount"
          pattern="-?[0-9]+"
          placeholder="Ví dụ: 150000 hoặc -50000"
          required
          type="text"
        />
        <small>Số âm dùng để ghi nhận điều chỉnh.</small>
      </label>
      <label className="form-field">
        <span>Ngày giao dịch</span>
        <input
          defaultValue={transaction?.occurredOn ?? today}
          name="occurredOn"
          required
          type="date"
        />
      </label>
      <label className="form-field transaction-description">
        <span>Mô tả (không bắt buộc)</span>
        <input
          defaultValue={transaction?.description ?? ""}
          maxLength={500}
          name="description"
          type="text"
        />
      </label>
      <button className="primary-button" disabled={pending} type="submit">
        {pending
          ? "Đang lưu…"
          : transaction
            ? "Lưu thay đổi"
            : (submitLabel ?? "Thêm giao dịch")}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}
