import "server-only";

import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { sendAlert } from "./alerts";
import {
  backupDatabaseTo,
  compactAudienceHistory,
  deleteOldRouletteResults,
  deleteStaleSessions,
  getAppState,
  getDatabasePath,
  setAppState,
} from "./session-store";

// Daily housekeeping inside the single app process: a SQLite backup next to the
// database (on the Railway volume) and retention cleanups. Tunable through env:
//   DB_BACKUP_DISABLED=1, DB_BACKUP_KEEP (default 7 daily files),
//   SESSION_RETENTION_DAYS (30), ROULETTE_RESULT_RETENTION_DAYS (365),
//   AUDIENCE_EVENT_RETENTION_DAYS (180).

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function koreanDate(timestamp: number) {
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function backupsDirectory() {
  return join(dirname(getDatabasePath()), "backups");
}

export function runDailyBackup(now = Date.now()) {
  if (process.env.DB_BACKUP_DISABLED === "1") return null;
  const directory = backupsDirectory();
  const name = `nagu-${koreanDate(now)}.db`;
  mkdirSync(directory, { recursive: true });
  const existing = readdirSync(directory).filter((file) => /^nagu-\d{4}-\d{2}-\d{2}\.db$/u.test(file));
  if (existing.includes(name)) return null;

  // Written under a temporary name first so an interrupted backup never
  // looks like a finished one.
  const temporary = join(directory, `${name}.partial`);
  rmSync(temporary, { force: true });
  backupDatabaseTo(temporary);
  renameSync(temporary, join(directory, name));
  setAppState("maintenance:last_backup", new Date(now).toISOString());

  const keep = envNumber("DB_BACKUP_KEEP", 7);
  for (const old of [...existing, name].sort().reverse().slice(keep)) {
    rmSync(join(directory, old), { force: true });
  }
  return name;
}

export function runDailyCleanup(now = Date.now()) {
  const today = koreanDate(now);
  if (getAppState("maintenance:last_cleanup") === today) return null;
  const result = {
    sessions: deleteStaleSessions(now - envNumber("SESSION_RETENTION_DAYS", 30) * DAY_MS),
    rouletteResults: deleteOldRouletteResults(now - envNumber("ROULETTE_RESULT_RETENTION_DAYS", 365) * DAY_MS),
    audienceRows: compactAudienceHistory(now - envNumber("AUDIENCE_EVENT_RETENTION_DAYS", 180) * DAY_MS),
  };
  setAppState("maintenance:last_cleanup", today);
  return result;
}

function runMaintenance() {
  try {
    const backup = runDailyBackup();
    if (backup) console.log(`[maintenance] backup ${backup}`);
  } catch (error) {
    sendAlert("backup", `DB 백업 실패: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const cleanup = runDailyCleanup();
    if (cleanup) console.log("[maintenance] cleanup", cleanup);
  } catch (error) {
    sendAlert("cleanup", `데이터 정리 실패: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const globalForMaintenance = globalThis as typeof globalThis & { naguMaintenanceStarted?: boolean };

export function startMaintenance() {
  if (globalForMaintenance.naguMaintenanceStarted) return;
  globalForMaintenance.naguMaintenanceStarted = true;
  // First run shortly after boot (not during it), then hourly checks; each
  // task itself runs at most once per day.
  setTimeout(runMaintenance, 60_000).unref();
  setInterval(runMaintenance, CHECK_INTERVAL_MS).unref();
}
