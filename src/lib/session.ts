import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const currentSession = await getCurrentSession();
  if (!currentSession) {
    redirect("/login");
  }
  return currentSession;
}
