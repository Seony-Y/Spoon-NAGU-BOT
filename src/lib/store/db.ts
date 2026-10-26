import "server-only";

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { sendAlert } from "../alerts";

export type SessionRow = {
  id_hash: string;
  token_payload: string;
  bot_enabled: number;
  blocked: number;
  auth_valid: number;
  workspace_key: string | null;
  current_live_id: number | null;
  dj_user_id: string | null;
};

const globalForDatabase = globalThis as typeof globalThis & {
  naguSessionDatabase?: DatabaseSync;
};

function migrateDatabase(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS oauth_sessions (
      id_hash TEXT PRIMARY KEY,
      token_payload TEXT NOT NULL,
      bot_enabled INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0,
      auth_valid INTEGER NOT NULL DEFAULT 1,
      workspace_key TEXT,
      current_live_id INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  const columns = database.prepare("PRAGMA table_info(oauth_sessions)").all() as Array<{
    name: string;
  }>;
  if (!columns.some((column) => column.name === "bot_enabled")) {
    database.exec("ALTER TABLE oauth_sessions ADD COLUMN bot_enabled INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some((column) => column.name === "blocked")) {
    database.exec("ALTER TABLE oauth_sessions ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.some((column) => column.name === "auth_valid")) {
    database.exec("ALTER TABLE oauth_sessions ADD COLUMN auth_valid INTEGER NOT NULL DEFAULT 1");
  }
  if (!columns.some((column) => column.name === "workspace_key")) {
    database.exec("ALTER TABLE oauth_sessions ADD COLUMN workspace_key TEXT");
  }
  if (!columns.some((column) => column.name === "current_live_id")) {
    database.exec("ALTER TABLE oauth_sessions ADD COLUMN current_live_id INTEGER");
  }
  if (!columns.some((column) => column.name === "dj_user_id")) {
    database.exec("ALTER TABLE oauth_sessions ADD COLUMN dj_user_id TEXT");
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      session_key TEXT PRIMARY KEY,
      dj_nickname TEXT NOT NULL DEFAULT '',
      greeting_message TEXT NOT NULL DEFAULT '안녕하세요. DJ {name}입니다. {nickname}님, 반가워요!',
      donation_message TEXT NOT NULL DEFAULT '{nickname}님, {amount}스푼 후원 감사합니다!',
      heart_message TEXT NOT NULL DEFAULT '{nickname}님, 하트 {milestone}개 감사합니다!',
      hourly_enabled INTEGER NOT NULL DEFAULT 0,
      hourly_message TEXT NOT NULL DEFAULT 'DJ {name}의 방송과 함께해 주셔서 감사합니다!',
      repeat_interval_minutes INTEGER NOT NULL DEFAULT 10,
      commands_enabled INTEGER NOT NULL DEFAULT 1,
      welcome_enabled INTEGER NOT NULL DEFAULT 1,
      donation_enabled INTEGER NOT NULL DEFAULT 1,
      heart_enabled INTEGER NOT NULL DEFAULT 1,
      commands_initialized INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bot_commands (
      session_key TEXT NOT NULL,
      command TEXT NOT NULL,
      response TEXT NOT NULL,
      PRIMARY KEY (session_key, command)
    );
    CREATE TABLE IF NOT EXISTS bot_counters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      initial_value INTEGER NOT NULL DEFAULT 0,
      value INTEGER NOT NULL DEFAULT 0,
      UNIQUE (session_key, name)
    );
    CREATE TABLE IF NOT EXISTS song_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL,
      requester_nickname TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dj_workspaces (
      dj_user_id TEXT PRIMARY KEY,
      workspace_key TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audience_profiles (
      workspace_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      nickname TEXT,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_key, user_id)
    );
    CREATE TABLE IF NOT EXISTS audience_events (
      workspace_key TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      live_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      spoons INTEGER NOT NULL DEFAULT 0,
      hearts INTEGER NOT NULL DEFAULT 0,
      favorite_temperature REAL,
      occurred_at INTEGER NOT NULL,
      stat_date TEXT NOT NULL,
      PRIMARY KEY (workspace_key, event_id)
    );
    CREATE TABLE IF NOT EXISTS audience_spoon_snapshots (
      workspace_key TEXT NOT NULL,
      live_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      spoons INTEGER NOT NULL,
      stat_date TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_key, live_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS recent_bot_events (
      workspace_key TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_key, event_id)
    );
    CREATE TABLE IF NOT EXISTS rps_rounds (
      workspace_key TEXT NOT NULL,
      round_id INTEGER NOT NULL,
      dj_choice TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      PRIMARY KEY (workspace_key, round_id)
    );
    CREATE TABLE IF NOT EXISTS rps_entries (
      workspace_key TEXT NOT NULL,
      round_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      choice TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_key, round_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS raffle_rounds (
      workspace_key TEXT NOT NULL,
      round_id INTEGER NOT NULL,
      winner_count INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      PRIMARY KEY (workspace_key, round_id)
    );
    CREATE TABLE IF NOT EXISTS raffle_entries (
      workspace_key TEXT NOT NULL,
      round_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      winner INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_key, round_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_rounds (
      workspace_key TEXT NOT NULL,
      round_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      answer_normalized TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      winner_user_id TEXT,
      winner_nickname TEXT,
      elapsed_ms INTEGER,
      PRIMARY KEY (workspace_key, round_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_submissions (
      workspace_key TEXT NOT NULL,
      round_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      answer TEXT NOT NULL,
      answer_normalized TEXT NOT NULL,
      submitted_at INTEGER NOT NULL,
      correct INTEGER NOT NULL DEFAULT 0,
      correct_at INTEGER,
      PRIMARY KEY (workspace_key, round_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS broadcasts (
      workspace_key TEXT NOT NULL,
      live_id INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_key, live_id)
    );
    CREATE TABLE IF NOT EXISTS attendance (
      workspace_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      live_id INTEGER NOT NULL,
      nickname TEXT NOT NULL,
      attended_at INTEGER NOT NULL,
      month TEXT NOT NULL,
      PRIMARY KEY (workspace_key, user_id, live_id)
    );
    CREATE INDEX IF NOT EXISTS attendance_month_idx ON attendance (workspace_key, month);
    CREATE TABLE IF NOT EXISTS attendance_settings (
      workspace_key TEXT PRIMARY KEY,
      announce INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS team_battle_settings (
      workspace_key TEXT PRIMARY KEY,
      team_names TEXT NOT NULL,
      metric TEXT NOT NULL,
      goal INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS team_battles (
      workspace_key TEXT NOT NULL,
      battle_id INTEGER NOT NULL,
      team_names TEXT NOT NULL,
      metric TEXT NOT NULL,
      goal INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      winner_index INTEGER,
      last_lead_index INTEGER,
      last_lead_announced_at INTEGER,
      PRIMARY KEY (workspace_key, battle_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS team_battles_active_idx
      ON team_battles (workspace_key) WHERE active = 1;
    CREATE TABLE IF NOT EXISTS team_members (
      workspace_key TEXT NOT NULL,
      battle_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      team_index INTEGER NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_key, battle_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS secret_word_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_key TEXT NOT NULL,
      word TEXT NOT NULL,
      hint TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS secret_word_rounds (
      workspace_key TEXT NOT NULL,
      round_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      hint TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      winner_user_id TEXT,
      winner_nickname TEXT,
      found_at INTEGER,
      PRIMARY KEY (workspace_key, round_id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS secret_word_rounds_active_idx
      ON secret_word_rounds (workspace_key) WHERE active = 1;
    -- Funding goals for counters (e.g. 펀딩 [1,200 / 5,000 스푼]), by counter name.
    -- Kept out of bot_counters so older backups (fixed columns) still restore.
    CREATE TABLE IF NOT EXISTS counter_goals (
      workspace_key TEXT NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      goal INTEGER NOT NULL,
      auto_spoons INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (workspace_key, name)
    );
    -- Kept out of bot_settings so older backups (fixed bot_settings columns) still restore.
    CREATE TABLE IF NOT EXISTS follow_settings (
      workspace_key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      message TEXT NOT NULL DEFAULT '{nickname}님, 팔로우 감사합니다!'
    );
    CREATE TABLE IF NOT EXISTS quiz_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_key TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS quiz_queue_workspace_idx
      ON quiz_queue (workspace_key, created_at, id);
    CREATE TABLE IF NOT EXISTS roulette_settings (
      workspace_key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      cost INTEGER NOT NULL DEFAULT 20,
      miss_weight INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS roulette_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_key TEXT NOT NULL,
      label TEXT NOT NULL COLLATE NOCASE,
      weight INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (workspace_key, label)
    );
    CREATE TABLE IF NOT EXISTS roulette_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_key TEXT NOT NULL,
      live_id INTEGER NOT NULL,
      event_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      item_label TEXT,
      is_miss INTEGER NOT NULL,
      spoons INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (workspace_key, event_id)
    );
    CREATE TABLE IF NOT EXISTS roulette_keeps (
      workspace_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      item_label TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (workspace_key, user_id, item_label)
    );
    CREATE INDEX IF NOT EXISTS audience_events_period_idx
      ON audience_events (workspace_key, stat_date, live_id, user_id);
    -- Per-user totals of audience events compacted away after the retention
    -- period, so all-time rankings keep counting them.
    CREATE TABLE IF NOT EXISTS audience_archive (
      workspace_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      spoons INTEGER NOT NULL DEFAULT 0,
      hearts INTEGER NOT NULL DEFAULT 0,
      favorite_temperature REAL,
      PRIMARY KEY (workspace_key, user_id)
    );
    CREATE TABLE IF NOT EXISTS blocked_djs (
      dj_user_id TEXT PRIMARY KEY,
      blocked_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_migrations (
      key TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const songRequestColumns = database.prepare("PRAGMA table_info(song_requests)").all() as Array<{
    name: string;
  }>;
  if (!songRequestColumns.some((column) => column.name === "artist")) {
    database.exec("ALTER TABLE song_requests ADD COLUMN artist TEXT NOT NULL DEFAULT ''");
  }
  database.exec(`
    CREATE INDEX IF NOT EXISTS song_requests_session_idx
    ON song_requests (session_key, id)
  `);

  const rpsRoundColumns = database.prepare("PRAGMA table_info(rps_rounds)").all() as Array<{
    name: string;
    pk: number;
  }>;
  if (rpsRoundColumns.find((column) => column.name === "round_id")?.pk === 0) {
    database.exec("BEGIN");
    try {
      database.exec(`
      CREATE TABLE rps_rounds_history (
        workspace_key TEXT NOT NULL,
        round_id INTEGER NOT NULL,
        dj_choice TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        PRIMARY KEY (workspace_key, round_id)
      );
      INSERT INTO rps_rounds_history (
        workspace_key, round_id, dj_choice, active, started_at, ended_at
      )
      SELECT workspace_key, round_id, dj_choice, active, started_at, ended_at
      FROM rps_rounds;
      DROP TABLE rps_rounds;
      ALTER TABLE rps_rounds_history RENAME TO rps_rounds;
    `);
      database.exec("COMMIT");
    } catch (error) {
      // Never leave the shared connection inside an open transaction.
      database.exec("ROLLBACK");
      throw error;
    }
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS rps_rounds_active_idx
    ON rps_rounds (workspace_key) WHERE active = 1
  `);
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS raffle_rounds_active_idx
    ON raffle_rounds (workspace_key) WHERE active = 1
  `);
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS quiz_rounds_active_idx
    ON quiz_rounds (workspace_key) WHERE active = 1
  `);
  const quizSubmissionColumns = database.prepare("PRAGMA table_info(quiz_submissions)").all() as Array<{
    name: string;
  }>;
  if (!quizSubmissionColumns.some((column) => column.name === "correct")) {
    database.exec("ALTER TABLE quiz_submissions ADD COLUMN correct INTEGER NOT NULL DEFAULT 0");
  }
  if (!quizSubmissionColumns.some((column) => column.name === "correct_at")) {
    database.exec("ALTER TABLE quiz_submissions ADD COLUMN correct_at INTEGER");
  }

  const attendanceColumns = database.prepare("PRAGMA table_info(attendance)").all() as Array<{ name: string }>;
  if (!attendanceColumns.some((column) => column.name === "checked_in")) {
    database.exec("ALTER TABLE attendance ADD COLUMN checked_in INTEGER NOT NULL DEFAULT 0");
  }

  const settingsColumns = database.prepare("PRAGMA table_info(bot_settings)").all() as Array<{
    name: string;
  }>;
  if (!settingsColumns.some((column) => column.name === "dj_nickname")) {
    database.exec("ALTER TABLE bot_settings ADD COLUMN dj_nickname TEXT NOT NULL DEFAULT ''");
    database.prepare(`
      UPDATE bot_settings SET greeting_message = ? WHERE greeting_message = ?
    `).run(
      "안녕하세요. DJ {name}입니다. {nickname}님, 반가워요!",
      "{nickname}님, 어서 오세요!",
    );
  }
  if (!settingsColumns.some((column) => column.name === "donation_message")) {
    database.exec("ALTER TABLE bot_settings ADD COLUMN donation_message TEXT NOT NULL DEFAULT '{nickname}님, {amount}스푼 후원 감사합니다!'");
  }
  if (!settingsColumns.some((column) => column.name === "heart_message")) {
    database.exec("ALTER TABLE bot_settings ADD COLUMN heart_message TEXT NOT NULL DEFAULT '{nickname}님, 하트 {milestone}개 감사합니다!'");
  }
  if (!settingsColumns.some((column) => column.name === "hourly_enabled")) {
    database.exec("ALTER TABLE bot_settings ADD COLUMN hourly_enabled INTEGER NOT NULL DEFAULT 0");
  }
  if (!settingsColumns.some((column) => column.name === "hourly_message")) {
    database.exec("ALTER TABLE bot_settings ADD COLUMN hourly_message TEXT NOT NULL DEFAULT 'DJ {name}의 방송과 함께해 주셔서 감사합니다!'");
  }
  if (!settingsColumns.some((column) => column.name === "repeat_interval_minutes")) {
    database.exec("ALTER TABLE bot_settings ADD COLUMN repeat_interval_minutes INTEGER NOT NULL DEFAULT 10");
  }
  const repeatDefaultMigration = database.prepare(
    "INSERT OR IGNORE INTO app_migrations (key, applied_at) VALUES (?, ?)",
  ).run("repeat_default_10", Date.now());
  if (repeatDefaultMigration.changes > 0) {
    database.exec("UPDATE bot_settings SET repeat_interval_minutes = 10 WHERE repeat_interval_minutes = 60");
  }
  database.prepare("UPDATE bot_settings SET heart_message = ? WHERE heart_message = ?").run(
    "{nickname}님, 하트 {milestone}개 감사합니다!",
    "하트 {milestone}개를 달성했어요! 감사합니다!",
  );
}

// Every query runs synchronously on the one event loop all bots share, so a
// slow one stalls every broadcast at once. Queries at or above SLOW_QUERY_MS
// (default 100) are logged with their SQL (never their parameters), and lock
// timeouts raise an alert. Tunable through env: SLOW_QUERY_MS.
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS) > 0 ? Number(process.env.SLOW_QUERY_MS) : 100;

function timeQuery<T>(sql: string, run: () => T): T {
  const startedAt = performance.now();
  try {
    return run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/database is (locked|busy)/iu.test(message)) {
      sendAlert("db-busy", `DB 잠금 대기 시간 초과: ${message} (${sqlLabel(sql)})`);
    }
    throw error;
  } finally {
    const elapsed = performance.now() - startedAt;
    if (elapsed >= SLOW_QUERY_MS) {
      console.warn(`[slow-query] ${Math.round(elapsed)}ms ${sqlLabel(sql)}`);
    }
  }
}

function sqlLabel(sql: string) {
  const compact = sql.replace(/\s+/gu, " ").trim();
  return compact.length > 200 ? `${compact.slice(0, 200)}…` : compact;
}

function instrumentStatement(statement: StatementSync, sql: string) {
  return new Proxy(statement, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (property === "run" || property === "get" || property === "all") {
        return (...args: unknown[]) => timeQuery(sql, () => value.apply(target, args));
      }
      return value.bind(target);
    },
  });
}

function instrumentDatabase(database: DatabaseSync) {
  return new Proxy(database, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (property === "prepare") {
        return (sql: string) => instrumentStatement(target.prepare(sql), sql);
      }
      if (property === "exec") {
        return (sql: string) => timeQuery(sql, () => target.exec(sql));
      }
      return value.bind(target);
    },
  });
}

// Module-scoped so migrations run once per process, yet rerun when this module
// is re-evaluated by dev HMR while the connection itself is reused.
let migratedDatabase: DatabaseSync | undefined;

export function getDatabasePath() {
  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  return resolve(
    /* turbopackIgnore: true */ process.env.SESSION_STORE_PATH
      || (isRailway ? "/data/nagu.db" : ".data/nagu.db"),
  );
}

// On Railway, a database outside the attached volume lives in the container
// and is lost on every deploy (logins, settings, history). Railway sets
// RAILWAY_VOLUME_MOUNT_PATH only when a volume is attached. null off Railway.
export function isDatabaseOnPersistentVolume() {
  const isRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
  if (!isRailway) return null;
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (!mount) return false;
  const inside = relative(resolve(mount), getDatabasePath());
  return inside !== "" && !inside.startsWith("..") && !isAbsolute(inside);
}

export function getDatabase() {
  if (globalForDatabase.naguSessionDatabase) {
    if (migratedDatabase !== globalForDatabase.naguSessionDatabase) {
      migrateDatabase(globalForDatabase.naguSessionDatabase);
      migratedDatabase = globalForDatabase.naguSessionDatabase;
    }
    return globalForDatabase.naguSessionDatabase;
  }

  const databasePath = getDatabasePath();
  mkdirSync(dirname(databasePath), { recursive: true });

  // Wait briefly instead of failing at once if another process (a deploy
  // overlap, the sqlite CLI, a backup) holds the write lock.
  const database = instrumentDatabase(new DatabaseSync(databasePath, { timeout: 5_000 }));
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  migrateDatabase(database);
  migratedDatabase = database;

  globalForDatabase.naguSessionDatabase = database;
  return database;
}

export function getSessionKey(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("hex");
}

export function getWorkspaceKey(sessionKey: string) {
  const row = getDatabase().prepare(
    "SELECT workspace_key FROM oauth_sessions WHERE id_hash = ?",
  ).get(sessionKey) as Pick<SessionRow, "workspace_key"> | undefined;
  return row?.workspace_key || sessionKey;
}

// Folds the WAL into the main database file; best effort at shutdown.
export function checkpointDatabase() {
  try {
    getDatabase().exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // The WAL is durable on its own; a failed checkpoint only costs startup time.
  }
}

export function getAppState(key: string) {
  const row = getDatabase().prepare("SELECT value FROM app_state WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setAppState(key: string, value: string) {
  getDatabase().prepare(`
    INSERT INTO app_state (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// Consistent copy of the live database (safe while it is being written).
export function backupDatabaseTo(path: string) {
  getDatabase().exec(`VACUUM INTO '${path.replaceAll("'", "''")}'`);
}

export function checkDatabase() {
  getDatabase().prepare("SELECT 1").get();
}
