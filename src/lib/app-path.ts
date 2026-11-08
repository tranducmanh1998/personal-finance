export const appBasePath = process.env.NEXT_PUBLIC_APP_BASE_PATH ?? "";

export function appPath(path: `/${string}`): string {
  return `${appBasePath}${path}`;
}
