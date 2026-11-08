import Link from "next/link";
import { appPath } from "@/lib/app-path";
import { listCategories } from "@/features/categories/category.service";
import { getBackfillState } from "@/features/history/history.repository";
import { previewBackfillRange } from "@/features/history/history.service";
import { DomainError } from "@/lib/errors";
import { requireUserId } from "@/lib/dal";
import { AssetForm } from "../../assets/asset-form";
import { DebtForm } from "../../debts/debt-form";
import { TransactionForm } from "../../transactions/transaction-form";
import {
  createHistoricalDebtAction,
  createHistoricalTransactionAction,
  saveHistoricalAssetBalancesAction,
} from "./actions";
import { ConfirmBackfillForm } from "./confirm-form";

type BackfillSearchParams = Promise<{
  startMonth?: string | string[];
  endMonth?: string | string[];
}>;

function previousDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function selectedValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BackfillPage({
  searchParams,
}: Readonly<{ searchParams: BackfillSearchParams }>) {
  const userId = await requireUserId();
  const [categories, backfillState, params] = await Promise.all([
    listCategories(userId),
    getBackfillState(userId),
    searchParams,
  ]);
  const startMonth = selectedValue(params.startMonth);
  const endMonth = selectedValue(params.endMonth);
  const backfillDate = previousDate();

  let preview: Awaited<ReturnType<typeof previewBackfillRange>> | null = null;
  let previewError: string | null = null;
  if (!backfillState && (startMonth || endMonth)) {
    try {
      if (!startMonth || !endMonth) {
        previewError = "Chọn cả tháng bắt đầu và tháng kết thúc.";
      } else {
        preview = await previewBackfillRange(userId, startMonth, endMonth);
      }
    } catch (error) {
      if (error instanceof DomainError) {
        previewError = "Khoảng tháng không hợp lệ hoặc có tháng chưa kết thúc.";
      } else {
        throw error;
      }
    }
  }

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Nhập bổ sung trước go-live</p>
          <h1>Dữ liệu lịch sử ban đầu</h1>
          <p className="muted">
            Nhập dữ liệu nghiệp vụ có ngày trước hôm nay. Tháng chỉ bị khóa sau
            khi xem trước và xác nhận rõ.
          </p>
        </div>
      </header>

      {backfillState ? (
        <aside className="history-notice" role="status">
          Quy trình backfill đã được xác nhận ngày{" "}
          {backfillState.completedAt.toLocaleString("vi-VN")}, từ{" "}
          {backfillState.startMonth} đến {backfillState.endMonth}. Các tháng
          thiếu sau khoảng này được chốt bù lần lượt khi có request đã xác thực.
        </aside>
      ) : (
        <>
          <aside className="history-notice" role="status">
            Chưa xác nhận hoàn tất. Chưa có tháng nào bị khóa tự động. Dư nợ
            không có mốc tại ngày cần chốt sẽ được lưu là chưa đủ dữ liệu, không
            suy ngược từ số dư hiện tại.
          </aside>

          <section className="content-card" aria-labelledby="backfill-preview">
            <h2 id="backfill-preview">Xem trước các tháng cần chốt</h2>
            <form
              action={appPath("/history/backfill")}
              className="finance-form"
              method="get"
            >
              <label className="form-field">
                <span>Tháng bắt đầu</span>
                <input
                  defaultValue={startMonth}
                  name="startMonth"
                  required
                  type="month"
                />
              </label>
              <label className="form-field">
                <span>Tháng kết thúc</span>
                <input
                  defaultValue={endMonth}
                  name="endMonth"
                  required
                  type="month"
                />
              </label>
              <button className="secondary-button" type="submit">
                Xem trước khoảng chốt
              </button>
            </form>

            {previewError ? (
              <p className="error-message" role="alert">
                {previewError}
              </p>
            ) : null}
            {preview ? (
              <div className="backfill-preview" aria-live="polite">
                <p>
                  Khoảng <strong>{preview.startMonth}</strong> đến{" "}
                  <strong>{preview.endMonth}</strong>: {preview.months.length}{" "}
                  tháng, {preview.transactionCount} giao dịch và{" "}
                  {preview.unresolvedDebtCount} mốc dư nợ chưa đủ dữ liệu (đếm
                  theo khoản/tháng).
                </p>
                {preview.unresolvedDebtCount > 0 ? (
                  <p className="muted">
                    Nếu có căn cứ, hãy nhập/cập nhật mốc dư nợ theo ngày trước
                    khi chốt.{" "}
                    <Link className="text-link" href="/debts">
                      Quản lý mốc dư nợ
                    </Link>
                  </p>
                ) : null}
                {preview.earlierDataMonths.length > 0 ? (
                  <p className="history-notice">
                    Có dữ liệu trước tháng bắt đầu đã chọn (
                    {preview.earlierDataMonths.join(", ")}). Theo lựa chọn của
                    bạn, các tháng này sẽ không bị tự động chốt hoặc mở rộng vào
                    khoảng khóa.
                  </p>
                ) : null}
                <ul className="backfill-preview-list">
                  {preview.months.map((month) => (
                    <li key={month.month}>
                      <strong>{month.month}</strong>
                      <span>
                        {month.transactionCount} giao dịch ·{" "}
                        {month.unresolvedDebts.length} khoản nợ chưa đủ dữ liệu
                      </span>
                      {month.unresolvedDebts.map((debt) => (
                        <small key={`${month.month}-${debt.borrowerName}`}>
                          {debt.borrowerName} ({debt.loanType}) — mốc dư nợ{" "}
                          {debt.balanceAsOf}
                        </small>
                      ))}
                    </li>
                  ))}
                </ul>
                <ConfirmBackfillForm
                  startMonth={preview.startMonth}
                  endMonth={preview.endMonth}
                />
              </div>
            ) : null}
          </section>

          <section
            className="content-card"
            aria-labelledby="backfill-transaction"
          >
            <h2 id="backfill-transaction">Nhập giao dịch cũ</h2>
            <TransactionForm
              categories={categories}
              createAction={createHistoricalTransactionAction}
              submitLabel="Nhập giao dịch lịch sử"
              today={backfillDate}
            />
          </section>

          <section className="content-card" aria-labelledby="backfill-assets">
            <h2 id="backfill-assets">Nhập số dư tài sản tại một ngày cũ</h2>
            <AssetForm
              balances={new Map()}
              saveAction={saveHistoricalAssetBalancesAction}
              submitLabel="Nhập số dư lịch sử"
              today={backfillDate}
            />
          </section>

          <section className="content-card" aria-labelledby="backfill-debt">
            <h2 id="backfill-debt">Nhập thông tin khoản nợ ban đầu</h2>
            <DebtForm
              createAction={createHistoricalDebtAction}
              submitLabel="Nhập khoản nợ lịch sử"
              today={backfillDate}
            />
          </section>
        </>
      )}

      <p className="history-back-link">
        <Link className="text-link" href="/history">
          Quay lại lịch sử theo tháng
        </Link>
      </p>
    </section>
  );
}
