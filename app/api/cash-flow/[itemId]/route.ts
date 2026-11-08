import {
  deleteScheduleItem,
  scheduleItemNotFound,
  updateScheduleItem,
} from "@/features/cash-flow/schedule.service";
import {
  getScheduleUserId,
  readScheduleRequest,
  scheduleApiErrorResponse,
} from "@/features/cash-flow/schedule.api";

type RouteContext = Readonly<{ params: Promise<{ itemId: string }> }>;

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const userId = await getScheduleUserId();
  if (!userId) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Vui lòng đăng nhập." } },
      { status: 401 },
    );
  }

  try {
    const { itemId } = await context.params;
    const item = await updateScheduleItem(
      userId,
      itemId,
      await readScheduleRequest(request),
    );
    if (!item) {
      throw scheduleItemNotFound();
    }
    return Response.json({ item });
  } catch (error) {
    return scheduleApiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const userId = await getScheduleUserId();
  if (!userId) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Vui lòng đăng nhập." } },
      { status: 401 },
    );
  }

  try {
    const { itemId } = await context.params;
    if (!(await deleteScheduleItem(userId, itemId))) {
      throw scheduleItemNotFound();
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return scheduleApiErrorResponse(error);
  }
}
