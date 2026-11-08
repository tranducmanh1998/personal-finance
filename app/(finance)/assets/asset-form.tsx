"use client";

import { useActionState } from "react";
import { saveAssetBalances } from "./actions";
import type { ActionState } from "@/features/shared/action-state";

const initialState: ActionState = {};
type AssetAction = (
  previousState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

type AssetFormProps = Readonly<{
  today: string;
  balances: ReadonlyMap<string, Readonly<{ amount: string; asOfDate: string }>>;
}>;

const assetFields = [
  { kind: "cash", name: "cash", label: "Tiền mặt" },
  {
    kind: "savings_deposit",
    name: "savingsDeposit",
    label: "Tiền gửi tiết kiệm",
  },
  {
    kind: "cash_equivalent",
    name: "cashEquivalent",
    label: "Vật tương đương tiền",
  },
] as const;

export function AssetForm({
  today,
  balances,
  saveAction,
  submitLabel,
}: AssetFormProps &
  Readonly<{ saveAction?: AssetAction; submitLabel?: string }>) {
  const [state, formAction, pending] = useActionState(
    saveAction ?? saveAssetBalances,
    initialState,
  );

  return (
    <form action={formAction} className="finance-form">
      <label className="form-field">
        <span>Ngày chốt số dư</span>
        <input defaultValue={today} name="asOfDate" type="date" required />
      </label>
      <div className="asset-input-grid">
        {assetFields.map((field) => {
          const current = balances.get(field.kind);
          return (
            <label className="form-field" key={field.name}>
              <span>{field.label} (₫)</span>
              <input
                autoComplete="off"
                defaultValue={current?.amount ?? ""}
                inputMode="numeric"
                name={field.name}
                pattern="[0-9]+"
                placeholder="0"
                required
                type="text"
              />
              {current ? (
                <small className="muted">
                  Số dư gần nhất: {current.asOfDate}
                </small>
              ) : null}
            </label>
          );
        })}
      </div>
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang lưu…" : (submitLabel ?? "Lưu số dư")}
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
