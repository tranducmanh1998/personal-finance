"use client";

import { createAuthClient } from "better-auth/react";

import { appPath } from "@/lib/app-path";

export const authClient = createAuthClient({ basePath: appPath("/api/auth") });
