"use client";

import { useActionState } from "react";
import type { ActionState } from "@/features/shared/action-state";
import { finalizeHistoricalBackfillAction } from "./actions";

const initialState: ActionState = {};

export function ConfirmBackfillForm({
  startMonth,
  endMonth,
}: Readonly<{ startMonth: string; endMonth: string }>) {
  const [state, formAction, pending] = useActionState(
    finalizeHistoricalBackfillAction,
    initialState,
  );
  return (
    <form action={formAction} className="finance-form backfill-confirm-form">
      <input name="startMonth" type="hidden" value={startMonth} />
      <input name="endMonth" type="hidden" value={endMonth} />
      <label className="checkbox-field">
        <input name="confirmed" required type="checkbox" value="yes" />
        <span>
          Tôi đã rà soát bản xem trước và xác nhận chốt khoảng {startMonth} đến{" "}
          {endMonth}. Dữ liệu trong các tháng này sẽ không thể chỉnh sửa sau khi
          chốt.
        </span>
      </label>
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "Đang chốt lịch sử…" : "Xác nhận chốt lịch sử"}
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
