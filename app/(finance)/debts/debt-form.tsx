"use client";

import { useActionState } from "react";
import type { DebtDto } from "@/features/debts/debt.service";
import type { ActionState } from "@/features/shared/action-state";
import { createDebtAction, updateDebtAction } from "./actions";

const initialState: ActionState = {};
type DebtAction = (
  previousState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

type DebtFormProps = Readonly<{
  debt?: DebtDto;
  today: string;
}>;

const fields = [
  {
    name: "principalDuePerPeriod",
    label: "Gốc trả trong kỳ (₫)",
    inputMode: "numeric",
  },
  {
    name: "interestDuePerPeriod",
    label: "Lãi trả trong kỳ (₫)",
    inputMode: "numeric",
  },
  {
    name: "paymentDuePerPeriod",
    label: "Tổng phải trả mỗi kỳ (₫)",
    inputMode: "numeric",
  },
] as const;

export function DebtForm({
  debt,
  today,
  createAction,
  submitLabel,
}: DebtFormProps &
  Readonly<{ createAction?: DebtAction; submitLabel?: string }>) {
  const action = debt ? updateDebtAction : (createAction ?? createDebtAction);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="finance-form debt-form">
      {debt ? <input name="debtId" type="hidden" value={debt.id} /> : null}
      <label className="form-field">
        <span>Tên người vay</span>
        <input
          autoComplete="off"
          defaultValue={debt?.borrowerName ?? ""}
          maxLength={120}
          name="borrowerName"
          required
        />
      </label>
      <label className="form-field">
        <span>Loại vay</span>
        <input
          autoComplete="off"
          defaultValue={debt?.loanType ?? ""}
          maxLength={120}
          name="loanType"
          required
        />
      </label>
      <label className="form-field">
        <span>Dư nợ tại ngày chốt (₫)</span>
        <input
          autoComplete="off"
          defaultValue={debt?.balanceAmount ?? ""}
          inputMode="numeric"
          name="balanceAmount"
          pattern="[0-9]+"
          placeholder="0"
          required
          type="text"
        />
      </label>
      <label className="form-field">
        <span>Ngày chốt dư nợ</span>
        <input
          defaultValue={debt?.balanceAsOf ?? today}
          name="balanceAsOf"
          required
          type="date"
        />
      </label>
      <label className="form-field">
        <span>Ngày đến hạn</span>
        <input
          defaultValue={debt?.dueDate ?? ""}
          name="dueDate"
          required
          type="date"
        />
      </label>
      {fields.map((field) => (
        <label className="form-field" key={field.name}>
          <span>{field.label}</span>
          <input
            autoComplete="off"
            defaultValue={debt?.[field.name] ?? ""}
            inputMode={field.inputMode}
            name={field.name}
            pattern="[0-9]+"
            placeholder="0"
            required
            type="text"
          />
        </label>
      ))}
      <label className="form-field">
        <span>Kỳ cuối cùng (không bắt buộc)</span>
        <input
          defaultValue={debt?.finalPeriod ?? ""}
          name="finalPeriod"
          type="date"
        />
      </label>
      <button className="primary-button" disabled={pending} type="submit">
        {pending
          ? "Đang lưu…"
          : debt
            ? "Lưu thay đổi"
            : (submitLabel ?? "Thêm khoản nợ")}
      </button>
      {state.error ? (
        <p className="error-message" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="success-message" role="status">
          {state.success}
        </p>
      ) : null}
    </form>
  );
}
