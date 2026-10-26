import "server-only";

import { statSync } from "node:fs";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { sendAlert } from "./alerts";
import { countRunningBots } from "./bot-runtime";
import { getDatabasePath } from "./session-store";

// Periodic load line for the deploy logs: event-loop delay (every bot and
// request shares one loop, so this is what DJs feel as lag), running bots,
// database size and memory. Slow queries are logged by the store itself.
// Tunable through env: METRICS_INTERVAL_MINUTES (default 5),
// EVENT_LOOP_ALERT_MS (default 1000; alert when the worst stall in an interval
// reaches it).

const MINUTE_MS = 60 * 1000;
const MB = 1024 * 1024;

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function fileSize(path: string) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function megabytes(bytes: number) {
  return (bytes / MB).toFixed(1);
}

const globalForMetrics = globalThis as typeof globalThis & { naguMetricsStarted?: boolean };

export function startMetrics() {
  if (globalForMetrics.naguMetricsStarted) return;
  globalForMetrics.naguMetricsStarted = true;

  const alertMs = envNumber("EVENT_LOOP_ALERT_MS", 1000);
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  setInterval(() => {
    // The histogram reports nanoseconds.
    const p50 = histogram.percentile(50) / 1e6;
    const p99 = histogram.percentile(99) / 1e6;
    const max = histogram.max / 1e6;
    histogram.reset();

    const databasePath = getDatabasePath();
    const memory = process.memoryUsage();
    console.log(
      `[metrics] loop_p50=${p50.toFixed(0)}ms loop_p99=${p99.toFixed(0)}ms loop_max=${max.toFixed(0)}ms`
      + ` bots=${countRunningBots()}`
      + ` db=${megabytes(fileSize(databasePath))}MB wal=${megabytes(fileSize(`${databasePath}-wal`))}MB`
      + ` rss=${megabytes(memory.rss)}MB heap=${megabytes(memory.heapUsed)}MB`,
    );
    if (max >= alertMs) {
      sendAlert("event-loop", `서버가 최대 ${max.toFixed(0)}ms 동안 멈췄습니다 (p99 ${p99.toFixed(0)}ms). 그동안 모든 봇의 응답이 늦어집니다.`);
    }
  }, envNumber("METRICS_INTERVAL_MINUTES", 5) * MINUTE_MS).unref();
}
