"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AvailabilityOccurrenceDto,
  MonthlyAvailabilityDto,
} from "./availability.service";

const currency = new Intl.NumberFormat("vi-VN");
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const monthFormatter = new Intl.DateTimeFormat("vi-VN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatAmount(value: string): string {
  return `${currency.format(BigInt(value))} ₫`;
}

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function formatMonth(value: string): string {
  return monthFormatter.format(new Date(`${value}-01T00:00:00.000Z`));
}

function actualValue(type: "transaction" | "debt_payment", id: string): string {
  return `${type}:${id}`;
}

function occurrenceKey(scheduleId: string, scheduledOn: string): string {
  return `${scheduleId}:${scheduledOn}`;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "object" &&
      body.error !== null &&
      "message" in body.error &&
      typeof body.error.message === "string"
    ) {
      return body.error.message;
    }
  } catch {
    return "Không đọc được phản hồi từ máy chủ.";
  }
  return "Không thể cập nhật khoản khớp.";
}

export function AvailabilityPanel({
  availability,
}: Readonly<{ availability: MonthlyAvailabilityDto }>) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submitMatch(
    event: FormEvent<HTMLFormElement>,
    occurrence: AvailabilityOccurrenceDto,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const selected = String(formData.get("actual") ?? "");
    const key = occurrenceKey(occurrence.scheduleId, occurrence.scheduledOn);
    const separator = selected.indexOf(":");
    if (separator < 0) {
      setErrors((current) => ({
        ...current,
        [key]: "Chọn một giao dịch thực tế cùng ngày để khớp.",
      }));
      return;
    }

    const type = selected.slice(0, separator);
    const id = selected.slice(separator + 1);
    setPendingKey(key);
    setErrors((current) => ({ ...current, [key]: "" }));
    try {
      const response = await fetch("/api/cash-flow/matches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduleId: occurrence.scheduleId,
          scheduledOn: occurrence.scheduledOn,
          ...(type === "transaction"
            ? { transactionId: id }
            : { debtPaymentId: id }),
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setMessages((current) => ({
        ...current,
        [key]: "Đã khớp khoản thực tế.",
      }));
      router.refresh();
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [key]:
          caught instanceof Error
            ? caught.message
            : "Không thể cập nhật khoản khớp.",
      }));
    } finally {
      setPendingKey(null);
    }
  }

  async function removeMatch(occurrence: AvailabilityOccurrenceDto) {
    const key = occurrenceKey(occurrence.scheduleId, occurrence.scheduledOn);
    setPendingKey(key);
    setErrors((current) => ({ ...current, [key]: "" }));
    try {
      const response = await fetch("/api/cash-flow/matches", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scheduleId: occurrence.scheduleId,
          scheduledOn: occurrence.scheduledOn,
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setMessages((current) => ({ ...current, [key]: "Đã gỡ khớp." }));
      router.refresh();
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        [key]:
          caught instanceof Error ? caught.message : "Không thể gỡ khoản khớp.",
      }));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <section
      className="availability-section"
      aria-labelledby="availability-title"
    >
      <header className="section-title-row">
        <div>
          <p className="eyebrow">Dự báo</p>
          <h2 id="availability-title">Số dư khả dụng theo tuần</h2>
        </div>
        <span className="muted">{formatMonth(availability.month)}</span>
      </header>
      <p className="muted">
        Tuần tính từ thứ Hai đến Chủ nhật. Số dư khả dụng chỉ là dự kiến; giao
        dịch thực tế đã khớp thay cho khoản dự kiến, không cộng hai lần.
      </p>
      <div className="availability-list">
        {availability.weeks.map((week) => (
          <article
            className="availability-week"
            key={week.weekStart}
            aria-label={`Tuần ${formatDate(week.weekStart)} đến ${formatDate(week.weekEnd)}`}
          >
            <h3>
              Tuần {formatDate(week.weekStart)} – {formatDate(week.weekEnd)}
            </h3>
            <div className="availability-segments">
              {week.segments.map((segment) => (
                <section
                  className="availability-segment"
                  key={segment.month}
                  aria-label={`Phần ${formatMonth(segment.month)}`}
                >
                  <h4>
                    {formatMonth(segment.month)}
                    <span>
                      {" "}
                      ({formatDate(segment.start)}–{formatDate(segment.end)})
                    </span>
                  </h4>
                  {!segment.openingBalanceComplete ? (
                    <p className="availability-warning">
                      Chưa đủ số dư đầu kỳ của cả tiền mặt, tiền gửi tiết kiệm
                      và tương đương tiền. <a href="/assets">Cập nhật số dư</a>
                    </p>
                  ) : null}
                  <dl className="availability-totals">
                    <div>
                      <dt>Số dư đầu phần</dt>
                      <dd>{formatAmount(segment.openingBalance)}</dd>
                    </div>
                    <div>
                      <dt>Thu</dt>
                      <dd>{formatAmount(segment.income)}</dd>
                    </div>
                    <div>
                      <dt>Chi</dt>
                      <dd>{formatAmount(segment.expenses)}</dd>
                    </div>
                    <div>
                      <dt>Trong đó trả nợ</dt>
                      <dd>{formatAmount(segment.debtPayments)}</dd>
                    </div>
                    <div className="availability-closing">
                      <dt>Khả dụng cuối phần</dt>
                      <dd>{formatAmount(segment.closingBalance)}</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>
          </article>
        ))}
      </div>

      <section
        className="availability-matches"
        aria-labelledby="availability-matches-title"
      >
        <h3 id="availability-matches-title">
          Khớp khoản dự kiến với giao dịch thực tế
        </h3>
        {availability.occurrences.length === 0 ? (
          <p className="empty-state">
            Tháng này chưa có khoản dự kiến. Lịch một lần và lịch lặp sẽ xuất
            hiện tại đây.
          </p>
        ) : (
          <ul className="schedule-list">
            {availability.occurrences.map((occurrence) => {
              const key = occurrenceKey(
                occurrence.scheduleId,
                occurrence.scheduledOn,
              );
              return (
                <li key={key}>
                  <article className="schedule-card availability-occurrence">
                    <div>
                      <p className="schedule-date">
                        {formatDate(occurrence.scheduledOn)}
                      </p>
                      <p
                        className={`schedule-kind schedule-kind--${occurrence.kind}`}
                      >
                        {occurrence.kind === "income" ? "Thu" : "Chi"} dự kiến
                      </p>
                      <h4>{occurrence.description || "Không có mô tả"}</h4>
                      <p>
                        Kế hoạch:{" "}
                        <strong>{formatAmount(occurrence.amount)}</strong>
                      </p>
                      {occurrence.matched ? (
                        <p className="availability-match-status" role="status">
                          Đã thay bằng thực tế:{" "}
                          {formatAmount(occurrence.matched.amount)}
                        </p>
                      ) : (
                        <p className="muted">Chưa khớp giao dịch thực tế</p>
                      )}
                    </div>
                    <form
                      className="availability-match-form"
                      onSubmit={(event) => void submitMatch(event, occurrence)}
                    >
                      <label className="form-field">
                        <span>Giao dịch cùng ngày</span>
                        <select
                          aria-label={`Giao dịch thực tế cho ${occurrence.description || "khoản dự kiến"} ngày ${occurrence.scheduledOn}`}
                          defaultValue={
                            occurrence.matched
                              ? actualValue(
                                  occurrence.matched.type,
                                  occurrence.matched.id,
                                )
                              : ""
                          }
                          name="actual"
                        >
                          <option disabled value="">
                            Chọn giao dịch thực tế
                          </option>
                          {occurrence.matched ? (
                            <option
                              value={actualValue(
                                occurrence.matched.type,
                                occurrence.matched.id,
                              )}
                            >
                              Đã khớp ·{" "}
                              {formatAmount(occurrence.matched.amount)}
                            </option>
                          ) : null}
                          {occurrence.candidates.map((candidate) => (
                            <option
                              key={candidate.id}
                              value={actualValue(candidate.type, candidate.id)}
                            >
                              {candidate.description ||
                                "Giao dịch không có mô tả"}{" "}
                              · {formatAmount(candidate.amount)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="schedule-actions">
                        <button
                          className="primary-button"
                          disabled={
                            pendingKey === key ||
                            occurrence.candidates.length === 0
                          }
                          type="submit"
                        >
                          {pendingKey === key ? "Đang lưu…" : "Khớp thực tế"}
                        </button>
                        {occurrence.matched ? (
                          <button
                            className="transaction-action-button"
                            disabled={pendingKey === key}
                            onClick={() => void removeMatch(occurrence)}
                            type="button"
                          >
                            Gỡ khớp
                          </button>
                        ) : null}
                      </div>
                      {errors[key] ? (
                        <p className="error-message" role="alert">
                          {errors[key]}
                        </p>
                      ) : null}
                      {messages[key] ? (
                        <p className="success-message" role="status">
                          {messages[key]}
                        </p>
                      ) : null}
                    </form>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
