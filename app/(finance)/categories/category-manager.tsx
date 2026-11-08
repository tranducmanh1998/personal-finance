"use client";

import { useActionState } from "react";
import type { ActionState } from "@/features/shared/action-state";
import {
  createCategoryAction,
  createOtherCategoriesAction,
  deleteCategoryAction,
  setMonthlySavingsCategoryAction,
} from "./actions";

type Category = Readonly<{
  id: string;
  name: string;
  kind: "income" | "expense";
  isMonthlySavings: boolean;
}>;

const initialState: ActionState = {};

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

function DeleteCategoryForm({ categoryId }: Readonly<{ categoryId: string }>) {
  const [state, formAction, pending] = useActionState(
    deleteCategoryAction,
    initialState,
  );

  return (
    <div className="category-delete">
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Bạn có chắc muốn xóa danh mục này không? Giao dịch đã lưu sẽ được giữ nguyên.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input name="categoryId" type="hidden" value={categoryId} />
        <button
          className="transaction-action-button transaction-action-button--danger"
          disabled={pending}
          type="submit"
        >
          {pending ? "Đang xóa…" : "Xóa"}
        </button>
      </form>
      <ActionMessage state={state} />
    </div>
  );
}

export function CategoryManager({
  categories,
}: Readonly<{ categories: readonly Category[] }>) {
  const [createState, createAction, createPending] = useActionState(
    createCategoryAction,
    initialState,
  );
  const [savingsState, savingsAction, savingsPending] = useActionState(
    setMonthlySavingsCategoryAction,
    initialState,
  );
  const [otherState, otherAction, otherPending] = useActionState(
    createOtherCategoriesAction,
    initialState,
  );
  const expenseCategories = categories.filter(
    (item) => item.kind === "expense",
  );

  return (
    <div className="category-layout">
      <section className="content-card" aria-labelledby="create-category-title">
        <h2 id="create-category-title">Tạo danh mục</h2>
        <form action={createAction} className="finance-form">
          <label className="form-field">
            <span>Tên danh mục</span>
            <input maxLength={50} name="name" required />
          </label>
          <label className="form-field">
            <span>Loại giao dịch</span>
            <select defaultValue="expense" name="kind">
              <option value="income">Thu nhập</option>
              <option value="expense">Chi tiêu</option>
            </select>
          </label>
          <label className="checkbox-field">
            <input name="isMonthlySavings" type="checkbox" />
            <span>Đánh dấu là tiết kiệm tháng này</span>
          </label>
          <button
            className="primary-button"
            disabled={createPending}
            type="submit"
          >
            {createPending ? "Đang lưu…" : "Thêm danh mục"}
          </button>
          <ActionMessage state={createState} />
        </form>
      </section>

      <section
        className="content-card"
        aria-labelledby="savings-category-title"
      >
        <h2 id="savings-category-title">Danh mục tiết kiệm tháng</h2>
        <p className="muted">
          Khoản này được tính trong chi tiêu và hiển thị riêng trên tổng quan.
        </p>
        <form action={savingsAction} className="finance-form">
          <label className="form-field">
            <span>Danh mục chi tiêu</span>
            <select
              defaultValue={
                expenseCategories.find((item) => item.isMonthlySavings)?.id ??
                ""
              }
              name="categoryId"
              required
            >
              <option disabled value="">
                Chọn danh mục
              </option>
              {expenseCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button"
            disabled={savingsPending || expenseCategories.length === 0}
            type="submit"
          >
            {savingsPending ? "Đang cập nhật…" : "Lưu danh mục tiết kiệm"}
          </button>
          <ActionMessage state={savingsState} />
        </form>
      </section>

      <section className="content-card" aria-labelledby="category-list-title">
        <div className="section-title-row">
          <h2 id="category-list-title">Danh mục hiện có</h2>
          <form action={otherAction}>
            <button
              className="secondary-button"
              disabled={otherPending}
              type="submit"
            >
              {otherPending ? "Đang tạo…" : "Bảo đảm danh mục “Khác”"}
            </button>
          </form>
        </div>
        <ActionMessage state={otherState} />
        {categories.length === 0 ? (
          <p className="empty-state">
            Chưa có danh mục. Bạn có thể tạo danh mục hoặc thêm hai danh mục
            “Khác” mặc định.
          </p>
        ) : (
          <ul className="category-list">
            {categories.map((item) => (
              <li key={item.id}>
                <div className="category-list-item">
                  <span>{item.name}</span>
                  <span className="category-meta">
                    {item.kind === "income" ? "Thu nhập" : "Chi tiêu"}
                    {item.isMonthlySavings ? " · Tiết kiệm tháng" : ""}
                  </span>
                </div>
                {item.name === "Khác" ? (
                  <span className="category-protected">Danh mục mặc định</span>
                ) : (
                  <DeleteCategoryForm categoryId={item.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
