import {
  removeOccurrenceMatch,
  setOccurrenceMatch,
} from "@/features/cash-flow/availability.service";
import {
  getScheduleUserId,
  readScheduleRequest,
  scheduleApiErrorResponse,
} from "@/features/cash-flow/schedule.api";

export async function POST(request: Request): Promise<Response> {
  const userId = await getScheduleUserId();
  if (!userId) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Vui lòng đăng nhập." } },
      { status: 401 },
    );
  }
  try {
    await setOccurrenceMatch(userId, await readScheduleRequest(request));
    return Response.json({ matched: true });
  } catch (error) {
    return scheduleApiErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const userId = await getScheduleUserId();
  if (!userId) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Vui lòng đăng nhập." } },
      { status: 401 },
    );
  }
  try {
    await removeOccurrenceMatch(userId, await readScheduleRequest(request));
    return Response.json({ matched: false });
  } catch (error) {
    return scheduleApiErrorResponse(error);
  }
}
