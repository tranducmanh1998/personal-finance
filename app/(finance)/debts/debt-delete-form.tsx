"use client";

import { useActionState } from "react";
import type { ActionState } from "@/features/shared/action-state";
import { deleteDebtAction } from "./actions";

const initialState: ActionState = {};

export function DebtDeleteForm({
  debtId,
  settled,
}: Readonly<{ debtId: string; settled: boolean }>) {
  const [state, formAction, pending] = useActionState(
    deleteDebtAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="debt-delete-form"
      onSubmit={(event) => {
        if (
          !window.confirm(
            "Xóa khoản nợ đã tất toán khỏi danh sách theo dõi? Lịch sử thanh toán và giao dịch liên kết sẽ được giữ lại.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input name="debtId" type="hidden" value={debtId} />
      <button
        className="secondary-button"
        disabled={!settled || pending}
        type="submit"
      >
        {pending ? "Đang xóa…" : "Xóa khỏi danh sách"}
      </button>
      {!settled ? (
        <p className="muted">Chỉ có thể xóa sau khi đã tất toán.</p>
      ) : null}
      {state.error ? (
        <p className="error-message" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
