import { getCurrentSession } from "@/lib/session";
import { DomainError } from "@/lib/errors";
import { logError } from "@/lib/logger";

export async function getScheduleUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user.id ?? null;
}

export async function readScheduleRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new DomainError("INVALID_INPUT", [
        { field: "body", message: "Nội dung yêu cầu không phải JSON hợp lệ." },
      ]);
    }
    throw error;
  }
}

export function scheduleApiErrorResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    const status =
      error.code === "INVALID_INPUT"
        ? 400
        : error.code === "UNAUTHORIZED"
          ? 401
          : error.code === "NOT_FOUND"
            ? 404
            : 409;
    return Response.json(error.toResponse(), { status });
  }

  logError("persistence_failed");
  return Response.json(
    {
      error: {
        code: "INTERNAL",
        message: "Không thể lưu khoản dự kiến lúc này. Vui lòng thử lại.",
        fields: [],
      },
    },
    { status: 500 },
  );
}
