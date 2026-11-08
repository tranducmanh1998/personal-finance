import "server-only";
import { requireSession } from "./session";

export async function requireUserId(): Promise<string> {
  const currentSession = await requireSession();
  return currentSession.user.id;
}
