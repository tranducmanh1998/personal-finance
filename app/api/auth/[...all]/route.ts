import { toNextJsHandler } from "better-auth/next-js";
import { appBasePath } from "@/lib/app-path";
import { auth } from "@/lib/auth";

const handlers = toNextJsHandler(auth);

function restoreAuthPrefix(request: Request): Request {
  if (!appBasePath) return request;

  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/")) return request;

  url.pathname = `${appBasePath}${url.pathname}`;
  return new Request(url, request);
}

export function GET(request: Request) {
  return handlers.GET(restoreAuthPrefix(request));
}

export function POST(request: Request) {
  return handlers.POST(restoreAuthPrefix(request));
}
