import { requireUserId } from "@/lib/dal";
import { createMonthlyReport } from "@/features/export/monthly-report";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ month: string }> }) {
  const userId = await requireUserId();
  const { month } = await context.params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json({ error: "Tháng không hợp lệ." }, { status: 400 });
  }
  const buffer = await createMonthlyReport(userId, month);
  if (!buffer) {
    return Response.json({ error: "Tháng chưa được chốt hoặc chưa có snapshot." }, { status: 404 });
  }
  return new Response(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="bao-cao-${month}.xlsx"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
