type LogLevel = "info" | "warn" | "error";

export function serverLog(level: LogLevel, message: string, detail?: string) {
  fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level, message, detail }),
  }).catch(() => {});
}
