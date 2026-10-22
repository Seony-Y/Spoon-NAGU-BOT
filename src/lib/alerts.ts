import "server-only";

// Operator alerts through an optional webhook (ALERT_WEBHOOK_URL). The payload
// carries both `content` (Discord) and `text` (Slack), so either works. Each
// kind is sent at most once per 30 minutes so a flapping failure cannot spam.
const THROTTLE_MS = 30 * 60 * 1000;

const globalForAlerts = globalThis as typeof globalThis & {
  naguAlertsSentAt?: Map<string, number>;
};
const sentAt = globalForAlerts.naguAlertsSentAt ?? new Map<string, number>();
globalForAlerts.naguAlertsSentAt = sentAt;

export function sendAlert(kind: string, message: string) {
  console.error(`[alert:${kind}] ${message}`);
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const now = Date.now();
  if (now - (sentAt.get(kind) ?? 0) < THROTTLE_MS) return;
  sentAt.set(kind, now);
  const label = process.env.APP_ENV_LABEL ? ` ${process.env.APP_ENV_LABEL}` : "";
  const text = `[NAGU BOT${label}] ${message}`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text, text }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}

// Short, non-reversible label for a session in alerts and logs.
export function sessionLabel(sessionKey: string) {
  return sessionKey.slice(0, 8);
}
