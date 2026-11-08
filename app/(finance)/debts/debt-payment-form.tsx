"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/features/shared/action-state";
import { recordDebtPaymentAction } from "./actions";

const initialState: ActionState = {};
const currency = new Intl.NumberFormat("vi-VN");

function paymentTotal(principal: string, interest: string): string {
  if (!/^\d+$/.test(principal) || !/^\d+$/.test(interest)) {
    return "—";
  }
  return `${currency.format(BigInt(principal) + BigInt(interest))} ₫`;
}

export function DebtPaymentForm({
  debtId,
  today,
  currentPeriod,
}: Readonly<{
  debtId: string;
  today: string;
  currentPeriod: string;
}>) {
  const [principalAmount, setPrincipalAmount] = useState("0");
  const [interestAmount, setInterestAmount] = useState("0");
  const [state, formAction, pending] = useActionState(
    recordDebtPaymentAction,
    initialState,
  );

  return (
    <form action={formAction} className="finance-form debt-form">
      <input name="debtId" type="hidden" value={debtId} />
      <label className="form-field">
        <span>Kỳ trả</span>
        <input
          defaultValue={currentPeriod}
          name="period"
          required
          type="month"
        />
      </label>
      <label className="form-field">
        <span>Ngày thanh toán</span>
        <input defaultValue={today} name="paidOn" required type="date" />
      </label>
      <label className="form-field">
        <span>Tiền gốc thực trả (₫)</span>
        <input
          defaultValue="0"
          inputMode="numeric"
          min="0"
          name="principalAmount"
          onChange={(event) => setPrincipalAmount(event.currentTarget.value)}
          pattern="[0-9]+"
          placeholder="0"
          required
          type="text"
        />
      </label>
      <label className="form-field">
        <span>Tiền lãi thực trả (₫)</span>
        <input
          defaultValue="0"
          inputMode="numeric"
          min="0"
          name="interestAmount"
          onChange={(event) => setInterestAmount(event.currentTarget.value)}
          pattern="[0-9]+"
          placeholder="0"
          required
          type="text"
        />
      </label>
      <p className="muted">
        Tổng thanh toán:{" "}
        <output aria-live="polite">
          {paymentTotal(principalAmount, interestAmount)}
        </output>
        . Chỉ tiền gốc làm giảm dư nợ.
      </p>
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang lưu…" : "Ghi nhận thanh toán"}
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
