import Link from "next/link";
import { AvailabilityPanel } from "@/features/cash-flow/availability-panel";
import { getMonthlyAvailability } from "@/features/cash-flow/availability.service";
import { listScheduleItems } from "@/features/cash-flow/schedule.service";
import { ScheduleForm } from "@/features/cash-flow/schedule-form";
import { requireUserId } from "@/lib/dal";

function shiftMonth(value: string, amount: number): string {
  const date = new Date(`${value}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}

function isValidMonth(value: string | undefined): value is string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const date = new Date(`${value}-01T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 7) === value
  );
}

export default async function CashFlowPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ month?: string | string[] }>;
}>) {
  const userId = await requireUserId();
  const requestedMonth = (await searchParams).month;
  const currentMonth =
    typeof requestedMonth === "string" && isValidMonth(requestedMonth)
      ? requestedMonth
      : new Date().toISOString().slice(0, 7);
  const items = await listScheduleItems(userId);
  const availability = await getMonthlyAvailability(userId, currentMonth);

  return (
    <section>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Kế hoạch</p>
          <h1>Dòng tiền dự kiến</h1>
          <p className="muted">
            Lập khoản thu, chi một lần hoặc lặp hằng tuần/tháng. Khoản dự kiến
            không tự tạo giao dịch thực tế và không làm thay đổi số liệu tổng
            quan.
          </p>
        </div>
      </header>
      <nav className="availability-month-nav" aria-label="Chọn tháng dự báo">
        <Link href={`/cash-flow?month=${shiftMonth(currentMonth, -1)}`}>
          Tháng trước
        </Link>
        <Link href="/cash-flow">Tháng hiện tại</Link>
        <Link href={`/cash-flow?month=${shiftMonth(currentMonth, 1)}`}>
          Tháng sau
        </Link>
      </nav>
      <AvailabilityPanel availability={availability} />
      <ScheduleForm currentMonth={currentMonth} initialItems={items} />
    </section>
  );
}
