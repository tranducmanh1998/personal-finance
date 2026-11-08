"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { ActionState } from "@/features/shared/action-state";
import type {
  GoalDto,
  LinkableTransaction,
} from "@/features/goals/goal.service";
import {
  createGoalAction,
  setGoalTransactionLinkAction,
  updateGoalAction,
} from "./actions";

const currency = new Intl.NumberFormat("vi-VN");
const initialState: ActionState = {};

function formatVnd(amount: string): string {
  return `${currency.format(BigInt(amount))} ₫`;
}

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

function GoalTransactionLink({
  goalId,
  transaction,
}: Readonly<{
  goalId: string;
  transaction: LinkableTransaction;
}>) {
  const [state, formAction, pending] = useActionState(
    setGoalTransactionLinkAction,
    initialState,
  );
  return (
    <div className="goal-transaction-row">
      <div>
        <p>{transaction.description || transaction.categoryName}</p>
        <span className="muted">
          {transaction.occurredOn} ·{" "}
          {transaction.kind === "income" ? "Thu nhập" : "Chi tiêu"} ·{" "}
          {formatVnd(transaction.amount)}
        </span>
      </div>
      <form action={formAction}>
        <input name="goalId" type="hidden" value={goalId} />
        <input name="transactionId" type="hidden" value={transaction.id} />
        <input
          name="linked"
          type="hidden"
          value={transaction.linked ? "false" : "true"}
        />
        <button
          className="secondary-button goal-link-button"
          disabled={pending}
          type="submit"
        >
          {pending
            ? "Đang lưu…"
            : transaction.linked
              ? "Bỏ liên kết"
              : "Liên kết"}
        </button>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

function GoalCard({
  goal,
  transactions,
}: Readonly<{
  goal: GoalDto;
  transactions: readonly LinkableTransaction[];
}>) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateGoalAction,
    initialState,
  );

  return (
    <article className="goal-card">
      <div className="goal-card-heading">
        <div>
          <h2>{goal.name}</h2>
          {goal.targetDate ? (
            <p className="muted">Dự kiến: {goal.targetDate}</p>
          ) : null}
        </div>
        <button
          aria-expanded={editing}
          className="transaction-action-button"
          onClick={() => setEditing((current) => !current)}
          type="button"
        >
          {editing ? "Đóng chỉnh sửa" : "Sửa mục tiêu"}
        </button>
      </div>

      <dl className="goal-progress">
        <div>
          <dt>Tiến độ từ giao dịch đã liên kết</dt>
          <dd>{formatVnd(goal.progress)}</dd>
        </div>
        <div>
          <dt>Mục tiêu</dt>
          <dd>{formatVnd(goal.targetAmount)}</dd>
        </div>
        <div>
          <dt>Còn thiếu</dt>
          <dd>{formatVnd(goal.remaining)}</dd>
        </div>
      </dl>
      {goal.isComplete ? (
        <p className="success-message">Đã đạt mục tiêu.</p>
      ) : null}

      {editing ? (
        <form action={formAction} className="finance-form goal-form">
          <input name="goalId" type="hidden" value={goal.id} />
          <label className="form-field">
            <span>Tên mục tiêu</span>
            <input
              defaultValue={goal.name}
              maxLength={100}
              name="name"
              required
            />
          </label>
          <label className="form-field">
            <span>Số tiền mục tiêu (₫)</span>
            <input
              defaultValue={goal.targetAmount}
              inputMode="numeric"
              name="targetAmount"
              pattern="[0-9]+"
              required
              type="text"
            />
          </label>
          <label className="form-field">
            <span>Ngày dự kiến (không bắt buộc)</span>
            <input
              defaultValue={goal.targetDate ?? ""}
              name="targetDate"
              type="date"
            />
          </label>
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
          <ActionMessage state={state} />
        </form>
      ) : null}

      <details className="goal-transactions">
        <summary>
          Liên kết giao dịch (
          {transactions.filter((item) => item.linked).length})
        </summary>
        {transactions.length === 0 ? (
          <p className="empty-state">Chưa có giao dịch để liên kết.</p>
        ) : (
          <ul className="goal-transaction-list">
            {transactions.map((item) => (
              <li key={item.id}>
                <GoalTransactionLink goalId={goal.id} transaction={item} />
              </li>
            ))}
          </ul>
        )}
      </details>
    </article>
  );
}

export function GoalManager({
  goals,
  transactionsByGoal,
}: Readonly<{
  goals: readonly GoalDto[];
  transactionsByGoal: ReadonlyMap<string, readonly LinkableTransaction[]>;
}>) {
  const [state, formAction, pending] = useActionState(
    createGoalAction,
    initialState,
  );

  return (
    <>
      <section className="content-card" aria-labelledby="create-goal-title">
        <h2 id="create-goal-title">Tạo mục tiêu tiết kiệm</h2>
        <form action={formAction} className="finance-form goal-form">
          <label className="form-field">
            <span>Tên mục tiêu</span>
            <input maxLength={100} name="name" required />
          </label>
          <label className="form-field">
            <span>Số tiền mục tiêu (₫)</span>
            <input
              inputMode="numeric"
              name="targetAmount"
              pattern="[0-9]+"
              placeholder="Ví dụ: 10000000"
              required
              type="text"
            />
            <small>Nhập số nguyên đồng, không dùng dấu phân cách.</small>
          </label>
          <label className="form-field">
            <span>Ngày dự kiến (không bắt buộc)</span>
            <input name="targetDate" type="date" />
          </label>
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Đang lưu…" : "Tạo mục tiêu"}
          </button>
          <ActionMessage state={state} />
        </form>
      </section>

      <section className="goal-section" aria-labelledby="goal-list-title">
        <div className="section-title-row">
          <h2 id="goal-list-title">Mục tiêu của bạn</h2>
          <span className="muted">{goals.length} mục tiêu</span>
        </div>
        {goals.length === 0 ? (
          <p className="empty-state">
            Chưa có mục tiêu. Tiến độ chỉ tính từ giao dịch bạn liên kết rõ
            ràng.
          </p>
        ) : (
          <ul className="goal-list">
            {goals.map((goal) => (
              <li key={goal.id}>
                <GoalCard
                  goal={goal}
                  transactions={transactionsByGoal.get(goal.id) ?? []}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
