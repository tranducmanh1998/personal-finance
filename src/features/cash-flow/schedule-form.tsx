"use client";

import { appPath } from "@/lib/app-path";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ScheduleItemDto } from "./schedule.service";
import { getScheduleOccurrences } from "./recurrence";

const currency = new Intl.NumberFormat("vi-VN");
const weekdays = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

type ScheduleInput = Readonly<{
  kind: "income" | "expense";
  amount: string;
  scheduledOn: string;
  endDate: string;
  recurrence: ScheduleItemDto["recurrence"];
  description: string;
}>;

const emptyInput: ScheduleInput = {
  kind: "expense",
  amount: "",
  scheduledOn: "",
  endDate: "",
  recurrence: "once",
  description: "",
};

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return weekdays.format(new Date(year, month - 1, day));
}

function formatAmount(value: string): string {
  return `${currency.format(BigInt(value))} ₫`;
}

function formatRecurrence(item: ScheduleItemDto): string | null {
  if (item.recurrence === "once") return null;
  if (item.recurrence === "monthly") {
    const day = Number(item.scheduledOn.slice(-2));
    return `Lặp hằng tháng ngày ${day}; tháng không có ngày này sẽ bỏ qua${item.endDate ? ` đến hết ${formatDate(item.endDate)}` : ""}.`;
  }
  return `Lặp hằng tuần vào ${new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
  }).format(
    new Date(`${item.scheduledOn}T00:00:00`),
  )}${item.endDate ? ` đến hết ${formatDate(item.endDate)}` : ""}.`;
}

function sortItems(items: readonly ScheduleItemDto[]): ScheduleItemDto[] {
  return [...items].sort(
    (first, second) =>
      first.scheduledOn.localeCompare(second.scheduledOn) ||
      first.id.localeCompare(second.id),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isScheduleItem(value: unknown): value is ScheduleItemDto {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.kind === "income" || value.kind === "expense") &&
    typeof value.amount === "string" &&
    /^\d+$/.test(value.amount) &&
    typeof value.scheduledOn === "string" &&
    (typeof value.endDate === "string" || value.endDate === null) &&
    (value.recurrence === "once" ||
      value.recurrence === "weekly" ||
      value.recurrence === "monthly") &&
    (typeof value.description === "string" || value.description === null)
  );
}

async function responseBody(response: Response): Promise<{
  item?: ScheduleItemDto;
  error?: { message?: string };
}> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error("Không đọc được phản hồi từ máy chủ.");
  }
  if (!isRecord(value)) {
    throw new Error("Phản hồi từ máy chủ không hợp lệ.");
  }

  const item = isScheduleItem(value.item) ? value.item : undefined;
  const error =
    isRecord(value.error) && typeof value.error.message === "string"
      ? { message: value.error.message }
      : undefined;
  return { item, error };
}

function errorMessage(
  body: { error?: { message?: string } },
  fallback: string,
): string {
  return body.error?.message ?? fallback;
}

export function ScheduleForm({
  initialItems,
  currentMonth,
}: Readonly<{
  initialItems: readonly ScheduleItemDto[];
  currentMonth: string;
}>) {
  const router = useRouter();
  const [items, setItems] = useState(() => sortItems(initialItems));
  const [input, setInput] = useState<ScheduleInput>(emptyInput);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInput, setEditingInput] = useState<ScheduleInput>(emptyInput);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const monthEnd = new Date(`${currentMonth}-01T00:00:00.000Z`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const monthEndExclusive = monthEnd.toISOString().slice(0, 10);

  function updateInput(
    current: ScheduleInput,
    setCurrent: (next: ScheduleInput) => void,
    field: keyof ScheduleInput,
    value: string,
  ) {
    setCurrent({
      ...current,
      [field]: value,
      ...(field === "recurrence" ? { endDate: "" } : {}),
    });
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(appPath("/api/cash-flow"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, endDate: input.endDate || null }),
      });
      const body = await responseBody(response);
      if (!response.ok || !body.item) {
        throw new Error(errorMessage(body, "Không thể thêm khoản dự kiến."));
      }
      const created = body.item;
      setItems((current) => sortItems([...current, created]));
      setInput(emptyInput);
      setSuccess("Đã thêm khoản dự kiến.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể thêm khoản dự kiến.",
      );
    } finally {
      setPending(false);
    }
  }

  function beginEdit(item: ScheduleItemDto) {
    setEditingId(item.id);
    setEditingInput({
      kind: item.kind,
      amount: item.amount,
      scheduledOn: item.scheduledOn,
      endDate: item.endDate ?? "",
      recurrence: item.recurrence,
      description: item.description ?? "",
    });
    setError(null);
    setSuccess(null);
  }

  async function submitUpdate(
    event: FormEvent<HTMLFormElement>,
    itemId: string,
  ) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(appPath(`/api/cash-flow/${itemId}`), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...editingInput,
          endDate: editingInput.endDate || null,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok || !body.item) {
        throw new Error(errorMessage(body, "Không thể lưu thay đổi."));
      }
      const updated = body.item;
      setItems((current) =>
        sortItems(current.map((item) => (item.id === itemId ? updated : item))),
      );
      setEditingId(null);
      setSuccess("Đã cập nhật khoản dự kiến.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể lưu thay đổi.",
      );
    } finally {
      setPending(false);
    }
  }

  async function deleteItem(item: ScheduleItemDto) {
    if (
      !window.confirm("Xóa khoản dự kiến này? Thao tác không thể hoàn tác.")
    ) {
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(appPath(`/api/cash-flow/${item.id}`), {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await responseBody(response);
        throw new Error(errorMessage(body, "Không thể xóa khoản dự kiến."));
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (editingId === item.id) setEditingId(null);
      setSuccess("Đã xóa khoản dự kiến.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể xóa khoản dự kiến.",
      );
    } finally {
      setPending(false);
    }
  }

  function fields(
    value: ScheduleInput,
    setValue: (next: ScheduleInput) => void,
    prefix: string,
  ) {
    return (
      <>
        <label className="form-field">
          <span>Loại khoản dự kiến</span>
          <select
            name={`${prefix}kind`}
            onChange={(event) =>
              updateInput(value, setValue, "kind", event.target.value)
            }
            value={value.kind}
          >
            <option value="income">Thu nhập</option>
            <option value="expense">Chi tiêu</option>
          </select>
        </label>
        <label className="form-field">
          <span>Ngày dự kiến</span>
          <input
            name={`${prefix}scheduledOn`}
            onChange={(event) =>
              updateInput(value, setValue, "scheduledOn", event.target.value)
            }
            required
            type="date"
            value={value.scheduledOn}
          />
        </label>
        <label className="form-field">
          <span>Lặp lại</span>
          <select
            name={`${prefix}recurrence`}
            onChange={(event) =>
              updateInput(value, setValue, "recurrence", event.target.value)
            }
            value={value.recurrence}
          >
            <option value="once">Một lần</option>
            <option value="weekly">Hằng tuần</option>
            <option value="monthly">Hằng tháng</option>
          </select>
        </label>
        {value.recurrence !== "once" ? (
          <label className="form-field">
            <span>Ngày kết thúc lặp (không bắt buộc)</span>
            <input
              min={value.scheduledOn}
              name={`${prefix}endDate`}
              onChange={(event) =>
                updateInput(value, setValue, "endDate", event.target.value)
              }
              type="date"
              value={value.endDate}
            />
          </label>
        ) : null}
        <label className="form-field">
          <span>Số tiền (₫)</span>
          <input
            inputMode="numeric"
            name={`${prefix}amount`}
            onChange={(event) =>
              updateInput(value, setValue, "amount", event.target.value)
            }
            pattern="[0-9]+"
            required
            type="text"
            value={value.amount}
          />
          <small>Nhập số nguyên đồng dương, không dùng dấu phân cách.</small>
        </label>
        <label className="form-field">
          <span>Mô tả</span>
          <input
            maxLength={500}
            name={`${prefix}description`}
            onChange={(event) =>
              updateInput(value, setValue, "description", event.target.value)
            }
            value={value.description}
          />
        </label>
      </>
    );
  }

  return (
    <>
      <section className="content-card" aria-labelledby="create-schedule-title">
        <h2 id="create-schedule-title">Thêm khoản thu/chi dự kiến</h2>
        <p className="muted">
          Khoản dự kiến chỉ dùng để lên kế hoạch, không ghi vào giao dịch thực
          tế.
        </p>
        <form className="finance-form schedule-form" onSubmit={submitCreate}>
          {fields(input, setInput, "")}
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Đang lưu…" : "Thêm khoản dự kiến"}
          </button>
        </form>
      </section>

      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="success-message" role="status">
          {success}
        </p>
      ) : null}

      <section
        className="schedule-section"
        aria-labelledby="schedule-list-title"
      >
        <div className="section-title-row">
          <h2 id="schedule-list-title">Lịch thu/chi dự kiến</h2>
          <span className="muted">{items.length} khoản</span>
        </div>
        {items.length === 0 ? (
          <p className="empty-state">Chưa có khoản thu/chi dự kiến.</p>
        ) : (
          <ul className="schedule-list">
            {items.map((item) => (
              <li key={item.id}>
                <article className="schedule-card">
                  <div className="schedule-card-heading">
                    <div>
                      <p className="schedule-date">
                        <time dateTime={item.scheduledOn}>
                          {formatDate(item.scheduledOn)}
                        </time>
                      </p>
                      {formatRecurrence(item) ? (
                        <p className="schedule-recurrence">
                          {formatRecurrence(item)}
                        </p>
                      ) : null}
                      {item.recurrence !== "once" ? (
                        <p className="muted">
                          Ngày dự kiến trong tháng:{" "}
                          {getScheduleOccurrences(
                            [item],
                            `${currentMonth}-01`,
                            monthEndExclusive,
                          )
                            .map((occurrence) =>
                              Number(occurrence.scheduledOn.slice(-2)),
                            )
                            .join(", ") || "không có ngày phù hợp"}
                        </p>
                      ) : null}
                      <p
                        className={`schedule-kind schedule-kind--${item.kind}`}
                      >
                        {item.kind === "income" ? "Thu dự kiến" : "Chi dự kiến"}
                      </p>
                      <h3>{item.description || "Không có mô tả"}</h3>
                    </div>
                    <strong>{formatAmount(item.amount)}</strong>
                  </div>
                  <div className="schedule-actions">
                    <button
                      className="transaction-action-button"
                      disabled={pending}
                      onClick={() =>
                        editingId === item.id
                          ? setEditingId(null)
                          : beginEdit(item)
                      }
                      type="button"
                    >
                      {editingId === item.id ? "Đóng chỉnh sửa" : "Sửa"}
                    </button>
                    <button
                      className="transaction-action-button transaction-action-button--danger"
                      disabled={pending}
                      onClick={() => void deleteItem(item)}
                      type="button"
                    >
                      Xóa
                    </button>
                  </div>
                  {editingId === item.id ? (
                    <form
                      className="finance-form schedule-form schedule-edit-form"
                      onSubmit={(event) => void submitUpdate(event, item.id)}
                    >
                      {fields(editingInput, setEditingInput, "edit-")}
                      <button
                        className="primary-button"
                        disabled={pending}
                        type="submit"
                      >
                        {pending ? "Đang lưu…" : "Lưu thay đổi"}
                      </button>
                    </form>
                  ) : null}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
