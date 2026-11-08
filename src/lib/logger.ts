type SafeLogEvent =
  | "validation_failed"
  | "authentication_failed"
  | "persistence_failed"
  | "unexpected_error";

export function logError(event: SafeLogEvent): void {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event,
    }),
  );
}
