import {
  createScheduleItem,
  listScheduleItems,
} from "@/features/cash-flow/schedule.service";
import {
  getScheduleUserId,
  readScheduleRequest,
  scheduleApiErrorResponse,
} from "@/features/cash-flow/schedule.api";

export async function GET(): Promise<Response> {
  const userId = await getScheduleUserId();
  if (!userId) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Vui lòng đăng nhập." } },
      { status: 401 },
    );
  }

  try {
    return Response.json(
      { items: await listScheduleItems(userId) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return scheduleApiErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await getScheduleUserId();
  if (!userId) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Vui lòng đăng nhập." } },
      { status: 401 },
    );
  }

  try {
    const item = await createScheduleItem(
      userId,
      await readScheduleRequest(request),
    );
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return scheduleApiErrorResponse(error);
  }
}
