import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  formatCounterAdjustment,
  parseCounterCommand,
} from "./counter-command";
import type { SpoonToken } from "./spoon";
import {
  decryptToken,
  encryptToken,
  SessionConfigurationError,
  type StoredSpoonToken,
} from "./session";
import { parseSongRequestCommand } from "./song-request-command";
import type { ParsedSseEvent } from "./spoon-events";
import {
  getRpsResult,
  parseRpsCommand,
  type RpsChoice,
  type RpsResult,
} from "./rock-paper-scissors";

type SessionRow = {
  id_hash: string;
  token_payload: string;
  bot_enabled: number;
  blocked: number;
  workspace_key: string | null;
};

type BotSettingsRow = {
  dj_nickname: string;
  greeting_message: string;
  donation_message: string;
  heart_message: string;
  hourly_enabled: number;
  hourly_message: string;
  repeat_interval_minutes: number;
  commands_enabled: number;
  welcome_enabled: number;
  donation_enabled: number;
  heart_enabled: number;
  commands_initialized: number;
};

export type BotSettings = {
  djNickname: string;
  greetingMessage: string;
  donationMessage: string;
  heartMessage: string;
  repeatEnabled: boolean;
  repeatMessage: string;
  repeatIntervalMinutes: number;
  commandsEnabled: boolean;
  welcomeEnabled: boolean;
  donationEnabled: boolean;
  heartEnabled: boolean;
};

export type BotCommand = {
  command: string;
  response: string;
};

export type BotCounter = {
  id: number;
  name: string;
  value: number;
};

export type SongRequest = {
  id: number;
  requesterNickname: string;
  title: string;
  artist: string;
  createdAt: number;
};

export type RpsEntry = {
  userId: string;
  nickname: string;
  choice: RpsChoice;
  result: RpsResult;
};

export type RpsRound = {
  roundId: number;
  active: boolean;
  djChoice: RpsChoice;
  startedAt: number;
  endedAt: number | null;
  entries: RpsEntry[];
};

export type RouletteSettings = {
  enabled: boolean;
  cost: number;
  missWeight: number;
};

export type RouletteItem = {
  id: number;
  label: string;
  weight: number;
};

export type RouletteResult = {
  id: number;
  userId: string;
  nickname: string;
  itemLabel: string | null;
  isMiss: boolean;
  spoons: number;
  createdAt: number;
};

export type RouletteKeep = {
  userId: string;
  nickname: string;
  itemLabel: string;
  count: number;
  updatedAt: number;
};

export type AudienceRankingPeriod = "current" | "daily" | "all";

export type AudienceRankingEntry = {
  userId: string;
  nickname: string;
  spoons: number;
  hearts: number;
  favoriteTemperature: number | null;
};

export const AUDIENCE_RANKING_COMMANDS = [
  "!하트랭킹",
  "!애청온도랭킹",
  "!스푼랭킹",
  "!오늘의 하트랭킹",
  "!오늘의 애청온도랭킹",
  "!오늘의 스푼랭킹",
  "!내정보",
] as const;

export type AdminSession = {
  sessionKey: string;
  djNickname: string;
  botEnabled: boolean;
  blocked: boolean;
  createdAt: number;
  updatedAt: number;
};

export type EnabledBotSession = {
  sessionKey: string;
  token: StoredSpoonToken;
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
      workspace_key TEXT,
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
  if (!columns.some((column) => column.name === "workspace_key")) {
    database.exec("ALTER TABLE oauth_sessions ADD COLUMN workspace_key TEXT");
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

  const rpsRoundColumns = database.prepare("PRAGMA table_info(rps_rounds)").all() as Array<{
    name: string;
    pk: number;
  }>;
  if (rpsRoundColumns.find((column) => column.name === "round_id")?.pk === 0) {
    database.exec(`
      BEGIN;
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
      COMMIT;
    `);
  }
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS rps_rounds_active_idx
    ON rps_rounds (workspace_key) WHERE active = 1
  `);

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

function getDatabase() {
  if (globalForDatabase.naguSessionDatabase) {
    migrateDatabase(globalForDatabase.naguSessionDatabase);
    return globalForDatabase.naguSessionDatabase;
  }

  const databasePath = resolve(
    /* turbopackIgnore: true */ process.env.SESSION_STORE_PATH || ".data/nagu.db",
  );
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL");
  migrateDatabase(database);

  globalForDatabase.naguSessionDatabase = database;
  return database;
}

export function getSessionKey(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("hex");
}

function getWorkspaceKey(sessionKey: string) {
  const row = getDatabase().prepare(
    "SELECT workspace_key FROM oauth_sessions WHERE id_hash = ?",
  ).get(sessionKey) as Pick<SessionRow, "workspace_key"> | undefined;
  return row?.workspace_key || sessionKey;
}

function decryptStoredToken(sessionKey: string, payload: string): StoredSpoonToken | null {
  try {
    return decryptToken(payload);
  } catch (error) {
    if (error instanceof SessionConfigurationError) throw error;
    deleteAuthSessionByKey(sessionKey);
    return null;
  }
}

export function getSessionByKey(sessionKey: string): StoredSpoonToken | null {
  const row = getDatabase()
    .prepare("SELECT token_payload FROM oauth_sessions WHERE id_hash = ?")
    .get(sessionKey) as SessionRow | undefined;

  if (!row) return null;
  return decryptStoredToken(sessionKey, row.token_payload);
}

export function saveSession(currentSessionId: string | undefined, token: SpoonToken) {
  const now = Date.now();

  if (currentSessionId) {
    const sessionKey = getSessionKey(currentSessionId);
    getDatabase().prepare(`
      INSERT INTO oauth_sessions (id_hash, token_payload, workspace_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id_hash) DO UPDATE SET token_payload = excluded.token_payload, updated_at = excluded.updated_at
    `).run(sessionKey, encryptToken(token), sessionKey, now, now);
    return currentSessionId;
  }

  const sessionId = randomBytes(32).toString("base64url");
  const sessionKey = getSessionKey(sessionId);
  getDatabase()
    .prepare("INSERT INTO oauth_sessions (id_hash, token_payload, workspace_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(sessionKey, encryptToken(token), sessionKey, now, now);
  return sessionId;
}

export function getSession(sessionId: string | undefined) {
  return sessionId ? getSessionByKey(getSessionKey(sessionId)) : null;
}

export function updateSessionByKey(sessionKey: string, token: SpoonToken) {
  const result = getDatabase()
    .prepare("UPDATE oauth_sessions SET token_payload = ?, updated_at = ? WHERE id_hash = ?")
    .run(encryptToken(token), Date.now(), sessionKey);
  return result.changes > 0;
}

export function updateSession(sessionId: string, token: SpoonToken) {
  return updateSessionByKey(getSessionKey(sessionId), token);
}

export function deleteSessionByKey(sessionKey: string) {
  getDatabase()
    .prepare("DELETE FROM oauth_sessions WHERE id_hash = ?")
    .run(sessionKey);
}

export function deleteSession(sessionId: string) {
  deleteSessionByKey(getSessionKey(sessionId));
}

export function setBotEnabled(sessionId: string, enabled: boolean) {
  const result = getDatabase()
    .prepare("UPDATE oauth_sessions SET bot_enabled = ?, updated_at = ? WHERE id_hash = ? AND blocked = 0")
    .run(enabled ? 1 : 0, Date.now(), getSessionKey(sessionId));
  return result.changes > 0;
}

export function setBotEnabledByKey(sessionKey: string, enabled: boolean) {
  getDatabase()
    .prepare("UPDATE oauth_sessions SET bot_enabled = ?, updated_at = ? WHERE id_hash = ?")
    .run(enabled ? 1 : 0, Date.now(), sessionKey);
}

export function isBotEnabled(sessionId: string) {
  const row = getDatabase()
    .prepare("SELECT bot_enabled FROM oauth_sessions WHERE id_hash = ?")
    .get(getSessionKey(sessionId)) as Pick<SessionRow, "bot_enabled"> | undefined;
  return row?.bot_enabled === 1;
}

export function listEnabledBotSessions(): EnabledBotSession[] {
  const rows = getDatabase()
    .prepare("SELECT id_hash, token_payload, bot_enabled, blocked FROM oauth_sessions WHERE bot_enabled = 1 AND blocked = 0")
    .all() as SessionRow[];

  return rows.flatMap((row) => {
    const token = decryptStoredToken(row.id_hash, row.token_payload);
    return token ? [{ sessionKey: row.id_hash, token }] : [];
  });
}

function ensureBotSettings(sessionKey: string) {
  const database = getDatabase();
  const workspaceKey = getWorkspaceKey(sessionKey);
  database.prepare(`
    INSERT OR IGNORE INTO bot_settings (session_key, repeat_interval_minutes) VALUES (?, 10)
  `).run(workspaceKey);
  const settings = database.prepare("SELECT * FROM bot_settings WHERE session_key = ?")
    .get(workspaceKey) as BotSettingsRow;

  if (settings.commands_initialized === 0) {
    const insert = database.prepare(
      "INSERT OR IGNORE INTO bot_commands (session_key, command, response) VALUES (?, ?, ?)",
    );
    insert.run(workspaceKey, "!안녕", "{nickname}님, 반가워요!");
    insert.run(workspaceKey, "!명령어", "사용 가능한 명령어를 확인해 주세요.");
    database.prepare("UPDATE bot_settings SET commands_initialized = 1 WHERE session_key = ?")
      .run(workspaceKey);
  }
  database.prepare(`
    INSERT OR IGNORE INTO bot_counters (session_key, name, initial_value, value)
    VALUES (?, '실드', 0, 0)
  `).run(workspaceKey);

  return { settings, workspaceKey };
}

export function getBotSettingsByKey(sessionKey: string): BotSettings {
  const { settings: row } = ensureBotSettings(sessionKey);
  return {
    djNickname: row.dj_nickname,
    greetingMessage: row.greeting_message,
    donationMessage: row.donation_message,
    heartMessage: row.heart_message,
    repeatEnabled: row.hourly_enabled === 1,
    repeatMessage: row.hourly_message,
    repeatIntervalMinutes: row.repeat_interval_minutes,
    commandsEnabled: row.commands_enabled === 1,
    welcomeEnabled: row.welcome_enabled === 1,
    donationEnabled: row.donation_enabled === 1,
    heartEnabled: row.heart_enabled === 1,
  };
}

export function getBotSettings(sessionId: string) {
  return getBotSettingsByKey(getSessionKey(sessionId));
}

export function updateBotSettings(sessionId: string, settings: BotSettings) {
  const { workspaceKey } = ensureBotSettings(getSessionKey(sessionId));
  getDatabase().prepare(`
    UPDATE bot_settings
    SET dj_nickname = ?, greeting_message = ?, donation_message = ?, heart_message = ?,
        hourly_enabled = ?, hourly_message = ?, repeat_interval_minutes = ?,
        commands_enabled = ?, welcome_enabled = ?,
        donation_enabled = ?, heart_enabled = ?
    WHERE session_key = ?
  `).run(
    settings.djNickname,
    settings.greetingMessage,
    settings.donationMessage,
    settings.heartMessage,
    settings.repeatEnabled ? 1 : 0,
    settings.repeatMessage,
    settings.repeatIntervalMinutes,
    settings.commandsEnabled ? 1 : 0,
    settings.welcomeEnabled ? 1 : 0,
    settings.donationEnabled ? 1 : 0,
    settings.heartEnabled ? 1 : 0,
    workspaceKey,
  );
}

function mergeWorkspaceData(database: DatabaseSync, sourceKey: string, targetKey: string) {
  if (sourceKey === targetKey) return;

  database.prepare(`
    INSERT OR IGNORE INTO bot_commands (session_key, command, response)
    SELECT ?, command, response FROM bot_commands WHERE session_key = ?
  `).run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO bot_counters (session_key, name, initial_value, value)
    SELECT ?, name, initial_value, value FROM bot_counters WHERE session_key = ?
  `).run(targetKey, sourceKey);
  database.prepare("UPDATE song_requests SET session_key = ? WHERE session_key = ?")
    .run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO audience_events (
      workspace_key, event_id, event_type, live_id, user_id,
      spoons, hearts, favorite_temperature, occurred_at, stat_date
    )
    SELECT ?, event_id, event_type, live_id, user_id,
           spoons, hearts, favorite_temperature, occurred_at, stat_date
    FROM audience_events WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  const sourceRpsRounds = database.prepare(`
    SELECT round_id, dj_choice, active, started_at, ended_at
    FROM rps_rounds WHERE workspace_key = ? ORDER BY round_id
  `).all(sourceKey) as Array<{
    round_id: number;
    dj_choice: string;
    active: number;
    started_at: number;
    ended_at: number | null;
  }>;
  const targetRpsState = database.prepare(`
    SELECT COALESCE(MAX(round_id), 0) AS max_round_id, MAX(active) AS has_active
    FROM rps_rounds WHERE workspace_key = ?
  `).get(targetKey) as { max_round_id: number; has_active: number | null };
  let nextRoundId = targetRpsState.max_round_id;
  let targetHasActiveRound = targetRpsState.has_active === 1;
  for (const sourceRpsRound of sourceRpsRounds) {
    nextRoundId += 1;
    const active = sourceRpsRound.active === 1 && !targetHasActiveRound ? 1 : 0;
    if (active === 1) targetHasActiveRound = true;
    database.prepare(`
      INSERT INTO rps_rounds (
        workspace_key, round_id, dj_choice, active, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      targetKey,
      nextRoundId,
      sourceRpsRound.dj_choice,
      active,
      sourceRpsRound.started_at,
      active === 1 ? null : (sourceRpsRound.ended_at ?? Date.now()),
    );
    database.prepare(`
      INSERT OR IGNORE INTO rps_entries (
        workspace_key, round_id, user_id, nickname, choice, result, created_at
      )
      SELECT ?, ?, user_id, nickname, choice, result, created_at
      FROM rps_entries WHERE workspace_key = ? AND round_id = ?
    `).run(targetKey, nextRoundId, sourceKey, sourceRpsRound.round_id);
  }

  database.prepare(`
    INSERT OR IGNORE INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
    SELECT ?, enabled, cost, miss_weight FROM roulette_settings WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO roulette_items (workspace_key, label, weight, created_at)
    SELECT ?, label, weight, created_at FROM roulette_items WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO roulette_results (
      workspace_key, live_id, event_id, user_id, nickname,
      item_label, is_miss, spoons, created_at
    )
    SELECT ?, live_id, event_id, user_id, nickname,
           item_label, is_miss, spoons, created_at
    FROM roulette_results WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  const sourceRouletteKeeps = database.prepare(`
    SELECT user_id, nickname, item_label, count, updated_at
    FROM roulette_keeps WHERE workspace_key = ?
  `).all(sourceKey) as Array<{
    user_id: string;
    nickname: string;
    item_label: string;
    count: number;
    updated_at: number;
  }>;
  const mergeRouletteKeep = database.prepare(`
    INSERT INTO roulette_keeps (
      workspace_key, user_id, nickname, item_label, count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_key, user_id, item_label) DO UPDATE SET
      nickname = excluded.nickname,
      count = roulette_keeps.count + excluded.count,
      updated_at = MAX(roulette_keeps.updated_at, excluded.updated_at)
  `);
  for (const keep of sourceRouletteKeeps) {
    mergeRouletteKeep.run(
      targetKey,
      keep.user_id,
      keep.nickname,
      keep.item_label,
      keep.count,
      keep.updated_at,
    );
  }

  const profiles = database.prepare(`
    SELECT user_id, nickname, first_seen_at, last_seen_at
    FROM audience_profiles WHERE workspace_key = ?
  `).all(sourceKey) as Array<{
    user_id: string;
    nickname: string | null;
    first_seen_at: number;
    last_seen_at: number;
  }>;
  const mergeProfile = database.prepare(`
    INSERT INTO audience_profiles (workspace_key, user_id, nickname, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_key, user_id) DO UPDATE SET
      nickname = CASE
        WHEN excluded.last_seen_at >= audience_profiles.last_seen_at
        THEN COALESCE(excluded.nickname, audience_profiles.nickname)
        ELSE audience_profiles.nickname
      END,
      first_seen_at = MIN(audience_profiles.first_seen_at, excluded.first_seen_at),
      last_seen_at = MAX(audience_profiles.last_seen_at, excluded.last_seen_at)
  `);
  for (const profile of profiles) {
    mergeProfile.run(
      targetKey,
      profile.user_id,
      profile.nickname,
      profile.first_seen_at,
      profile.last_seen_at,
    );
  }

  database.prepare("DELETE FROM bot_commands WHERE session_key = ?").run(sourceKey);
  database.prepare("DELETE FROM bot_counters WHERE session_key = ?").run(sourceKey);
  database.prepare("DELETE FROM bot_settings WHERE session_key = ?").run(sourceKey);
  database.prepare("DELETE FROM audience_events WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM audience_profiles WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM rps_entries WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM rps_rounds WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM roulette_keeps WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM roulette_results WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM roulette_items WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM roulette_settings WHERE workspace_key = ?").run(sourceKey);
}

export function linkDjWorkspaceByKey(sessionKey: string, djUserId: string, nickname: string) {
  const normalized = nickname.trim().slice(0, 50);
  const normalizedUserId = djUserId.trim();
  if (!normalized || !normalizedUserId) return;
  const database = getDatabase();
  const currentWorkspaceKey = getWorkspaceKey(sessionKey);
  const existing = database.prepare(
    "SELECT workspace_key FROM dj_workspaces WHERE dj_user_id = ?",
  ).get(normalizedUserId) as { workspace_key: string } | undefined;
  const workspaceKey = existing?.workspace_key ?? currentWorkspaceKey;
  mergeWorkspaceData(database, currentWorkspaceKey, workspaceKey);
  const now = Date.now();
  database.prepare(`
    INSERT INTO dj_workspaces (dj_user_id, workspace_key, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(dj_user_id) DO UPDATE SET updated_at = excluded.updated_at
  `).run(normalizedUserId, workspaceKey, now, now);
  database.prepare("UPDATE oauth_sessions SET workspace_key = ? WHERE id_hash = ?")
    .run(workspaceKey, sessionKey);
  ensureBotSettings(sessionKey);
  getDatabase().prepare("UPDATE bot_settings SET dj_nickname = ? WHERE session_key = ?")
    .run(normalized, workspaceKey);
}

function getEventTime(event: Exclude<ParsedSseEvent, { event: "end" }>) {
  const value = event.event === "chat" ? event.data.sentTime : event.data.time;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}

function getKoreanDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function recordAudienceEvent(
  sessionKey: string,
  liveId: number,
  event: ParsedSseEvent,
) {
  if (event.event === "end" || event.event === "chat") return false;
  const workspaceKey = getWorkspaceKey(sessionKey);
  const occurredAt = getEventTime(event);
  const eventId = event.id || createHash("sha256")
    .update(`${event.event}:${JSON.stringify(event.data)}`)
    .digest("hex");
  const spoons = event.event === "donation" ? event.data.amount : 0;
  const hearts = event.event === "like" ? event.data.totalAmount : 0;
  const favoriteTemperature = event.event === "presence" ? event.data.favoriteTemperature : null;
  const database = getDatabase();
  const inserted = database.prepare(`
    INSERT OR IGNORE INTO audience_events (
      workspace_key, event_id, event_type, live_id, user_id,
      spoons, hearts, favorite_temperature, occurred_at, stat_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    workspaceKey,
    eventId,
    event.event,
    liveId,
    event.data.user.id,
    spoons,
    hearts,
    favoriteTemperature,
    occurredAt,
    getKoreanDate(occurredAt),
  );
  if (inserted.changes === 0) return false;

  database.prepare(`
    INSERT INTO audience_profiles (workspace_key, user_id, nickname, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_key, user_id) DO UPDATE SET
      nickname = COALESCE(excluded.nickname, audience_profiles.nickname),
      last_seen_at = MAX(audience_profiles.last_seen_at, excluded.last_seen_at)
  `).run(
    workspaceKey,
    event.data.user.id,
    event.data.user.nickname,
    occurredAt,
    occurredAt,
  );
  return true;
}

export function listAudienceRankingsByKey(
  sessionKey: string,
  period: AudienceRankingPeriod,
  liveId?: number,
): AudienceRankingEntry[] {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const conditions = ["e.workspace_key = ?"];
  const parameters: Array<string | number> = [workspaceKey];
  if (period === "current") {
    if (liveId === undefined) return [];
    conditions.push("e.live_id = ?");
    parameters.push(liveId);
  } else if (period === "daily") {
    conditions.push("e.stat_date = ?");
    parameters.push(getKoreanDate(Date.now()));
  }

  return getDatabase().prepare(`
    SELECT e.user_id, COALESCE(p.nickname, '청취자') AS nickname,
           SUM(e.spoons) AS spoons, SUM(e.hearts) AS hearts,
           MAX(e.favorite_temperature) AS favorite_temperature
    FROM audience_events e
    LEFT JOIN audience_profiles p
      ON p.workspace_key = e.workspace_key AND p.user_id = e.user_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY e.user_id, p.nickname
  `).all(...parameters).map((row) => {
    const entry = row as {
      user_id: string;
      nickname: string;
      spoons: number;
      hearts: number;
      favorite_temperature: number | null;
    };
    return {
      userId: entry.user_id,
      nickname: entry.nickname,
      spoons: entry.spoons,
      hearts: entry.hearts,
      favoriteTemperature: entry.favorite_temperature,
    };
  });
}

export function listAudienceRankings(
  sessionId: string,
  period: AudienceRankingPeriod,
  liveId?: number,
) {
  return listAudienceRankingsByKey(getSessionKey(sessionId), period, liveId);
}

function rankAudienceEntries(
  entries: AudienceRankingEntry[],
  value: (entry: AudienceRankingEntry) => number | null,
) {
  return [...entries]
    .filter((entry) => (value(entry) ?? 0) > 0)
    .sort((left, right) => (
      (value(right) ?? 0) - (value(left) ?? 0)
      || left.nickname.localeCompare(right.nickname, "ko-KR")
      || left.userId.localeCompare(right.userId)
    ));
}

function formatRankingReplies(scope: string, title: string, labels: string[]) {
  if (labels.length === 0) return [`[${scope} ${title}] 집계 데이터가 없습니다.`];
  return [`[${scope} ${title}]`, ...labels.slice(0, 10)];
}

export function getAudienceRankingCommandRepliesByKey(
  sessionKey: string,
  liveId: number | undefined,
  message: string,
  userId: string,
  nickname: string | null,
) {
  const command = message.trim().toLocaleLowerCase("ko-KR");
  if (!AUDIENCE_RANKING_COMMANDS.includes(command as typeof AUDIENCE_RANKING_COMMANDS[number])) {
    return null;
  }
  const isCurrentCommand = command.startsWith("!오늘의 ");
  if (isCurrentCommand && liveId === undefined) return ["현재 방송 랭킹을 조회할 수 없습니다."];

  const period: AudienceRankingPeriod = isCurrentCommand ? "current" : "all";
  const scope = isCurrentCommand ? "현재 방송" : "누적";
  const entries = listAudienceRankingsByKey(sessionKey, period, liveId);
  const heartRanking = rankAudienceEntries(entries, (entry) => entry.hearts);
  const favoriteRanking = rankAudienceEntries(entries, (entry) => entry.favoriteTemperature);
  const spoonRanking = rankAudienceEntries(entries, (entry) => entry.spoons);
  if (command === "!하트랭킹" || command === "!오늘의 하트랭킹") {
    return formatRankingReplies(scope, "하트 랭킹", heartRanking.map((entry, index) => (
      `${index + 1}위 ${entry.nickname.slice(0, 30)} ${entry.hearts.toLocaleString("ko-KR")}개`
    )));
  }
  if (command === "!애청온도랭킹" || command === "!오늘의 애청온도랭킹") {
    return formatRankingReplies(scope, "애청온도 랭킹", favoriteRanking.map((entry, index) => (
      `${index + 1}위 ${entry.nickname.slice(0, 30)} ${entry.favoriteTemperature?.toLocaleString("ko-KR")}°C`
    )));
  }
  if (command === "!스푼랭킹" || command === "!오늘의 스푼랭킹") {
    return formatRankingReplies(scope, "스푼 랭킹", spoonRanking.map((entry, index) => (
      `${index + 1}위 ${entry.nickname.slice(0, 30)}`
    )));
  }

  const rank = (ranking: AudienceRankingEntry[], targetUserId: string) => {
    const index = ranking.findIndex((entry) => entry.userId === targetUserId);
    return index < 0 ? null : { place: index + 1, entry: ranking[index] };
  };
  const formatMyInfo = (label: string, rankingEntries: AudienceRankingEntry[]) => {
    const heart = rank(rankAudienceEntries(rankingEntries, (entry) => entry.hearts), userId);
    const favorite = rank(
      rankAudienceEntries(rankingEntries, (entry) => entry.favoriteTemperature),
      userId,
    );
    const spoon = rank(rankAudienceEntries(rankingEntries, (entry) => entry.spoons), userId);
    return [
      `[${label}] 하트 ${heart ? `${heart.place}위 (${heart.entry.hearts.toLocaleString("ko-KR")}개)` : "순위 없음"}`,
      `[${label}] 애청온도 ${favorite ? `${favorite.place}위 (${favorite.entry.favoriteTemperature?.toLocaleString("ko-KR")}°C)` : "순위 없음"}`,
      `[${label}] 스푼 ${spoon ? `${spoon.place}위` : "순위 없음"}`,
    ];
  };
  const cumulativeEntries = listAudienceRankingsByKey(sessionKey, "all");
  const currentEntries = liveId === undefined
    ? []
    : listAudienceRankingsByKey(sessionKey, "current", liveId);
  return [
    `[${nickname?.trim() || "청취자"}님의 내정보]`,
    ...formatMyInfo("누적", cumulativeEntries),
    ...(liveId === undefined
      ? ["[현재 방송] 방송 정보를 조회할 수 없습니다."]
      : formatMyInfo("현재 방송", currentEntries)),
  ];
}

export function listBotCommandsByKey(sessionKey: string): BotCommand[] {
  const { workspaceKey } = ensureBotSettings(sessionKey);
  return getDatabase().prepare(
    "SELECT command, response FROM bot_commands WHERE session_key = ? ORDER BY command",
  ).all(workspaceKey) as BotCommand[];
}

export function listBotCommands(sessionId: string) {
  return listBotCommandsByKey(getSessionKey(sessionId));
}

export function upsertBotCommand(sessionId: string, command: string, response: string) {
  const { workspaceKey } = ensureBotSettings(getSessionKey(sessionId));
  getDatabase().prepare(`
    INSERT INTO bot_commands (session_key, command, response) VALUES (?, ?, ?)
    ON CONFLICT(session_key, command) DO UPDATE SET response = excluded.response
  `).run(workspaceKey, command, response);
}

export function updateBotCommand(
  sessionId: string,
  originalCommand: string,
  command: string,
  response: string,
) {
  const { workspaceKey } = ensureBotSettings(getSessionKey(sessionId));
  try {
    const result = getDatabase().prepare(`
      UPDATE bot_commands SET command = ?, response = ?
      WHERE session_key = ? AND command = ?
    `).run(command, response, workspaceKey, originalCommand);
    return result.changes > 0;
  } catch {
    return false;
  }
}

export function deleteBotCommand(sessionId: string, command: string) {
  getDatabase().prepare("DELETE FROM bot_commands WHERE session_key = ? AND command = ?")
    .run(getWorkspaceKey(getSessionKey(sessionId)), command);
}

export function findBotCommandResponse(sessionKey: string, message: string, nickname: string | null) {
  const { workspaceKey } = ensureBotSettings(sessionKey);
  const command = message.trim().toLocaleLowerCase("ko-KR");
  const row = getDatabase().prepare(
    "SELECT response FROM bot_commands WHERE session_key = ? AND command = ?",
  ).get(workspaceKey, command) as Pick<BotCommand, "response"> | undefined;
  if (!row) return null;

  const response = row.response.replaceAll("{nickname}", nickname?.trim() || "청취자");
  return response.length <= 200 ? response : response.slice(0, 200);
}

export function getAvailableCommandRepliesByKey(sessionKey: string) {
  const { workspaceKey } = ensureBotSettings(sessionKey);
  const commands = (getDatabase().prepare(`
    SELECT command FROM bot_commands
    WHERE session_key = ? AND command != '!명령어'
    ORDER BY command
  `).all(workspaceKey) as Array<{ command: string }>).map((row) => row.command);
  const counters = listBotCountersByKey(sessionKey);
  const publicLabels = [
    "!명령어",
    ...AUDIENCE_RANKING_COMMANDS,
    ...commands,
    ...counters.map((counter) => `!${counter.name}`),
    "!신청곡 곡명-가수",
    "!신청곡 목록",
    "!가위바위보 가위|바위|보",
    "!내 킵",
  ].filter((label, index, items) => items.indexOf(label) === index);
  const djLabels = [
    ...counters.map((counter) => `!${counter.name} +N/-N`),
    "!신청곡 삭제 번호",
  ];

  const replies: string[] = [];
  const appendGroup = (heading: string, continuation: string, labels: string[]) => {
    let groupReplyIndex = -1;
    for (const label of labels) {
      const current = groupReplyIndex >= 0 ? replies[groupReplyIndex] : undefined;
      if (!current || `${current}, ${label}`.length > 200) {
        replies.push(`${groupReplyIndex < 0 ? heading : continuation}: ${label}`);
        groupReplyIndex = replies.length - 1;
      } else {
        replies[groupReplyIndex] = `${current}, ${label}`;
      }
    }
  };
  appendGroup("전체 사용 명령어", "전체 명령어 계속", publicLabels);
  appendGroup("DJ 전용 명령어", "DJ 명령어 계속", djLabels);
  return replies;
}

export function listBotCountersByKey(sessionKey: string): BotCounter[] {
  const workspaceKey = getWorkspaceKey(sessionKey);
  return (getDatabase().prepare(`
    SELECT id, name, value
    FROM bot_counters
    WHERE session_key = ?
    ORDER BY id
  `).all(workspaceKey) as Array<{
    id: number;
    name: string;
    value: number;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    value: row.value,
  }));
}

export function listBotCounters(sessionId: string) {
  return listBotCountersByKey(getSessionKey(sessionId));
}

export function saveBotCounter(
  sessionId: string,
  id: number | null,
  name: string,
  value: number,
) {
  const database = getDatabase();
  const sessionKey = getWorkspaceKey(getSessionKey(sessionId));
  try {
    if (id === null) {
      database.prepare(`
        INSERT INTO bot_counters (session_key, name, initial_value, value)
        VALUES (?, ?, ?, ?)
      `).run(sessionKey, name, value, value);
      return true;
    }

    const existing = database.prepare(
      "SELECT name FROM bot_counters WHERE id = ? AND session_key = ?",
    ).get(id, sessionKey) as Pick<BotCounter, "name"> | undefined;
    if (!existing) return false;
    const savedName = existing.name.toLocaleLowerCase("ko-KR") === "실드" ? "실드" : name;
    const result = database.prepare(`
      UPDATE bot_counters
      SET name = ?, initial_value = ?, value = ?
      WHERE id = ? AND session_key = ?
    `).run(savedName, value, value, id, sessionKey);
    return result.changes > 0;
  } catch {
    return false;
  }
}

export function deleteBotCounter(sessionId: string, id: number) {
  const result = getDatabase().prepare(
    "DELETE FROM bot_counters WHERE id = ? AND session_key = ? AND name != '실드' COLLATE NOCASE",
  ).run(id, getWorkspaceKey(getSessionKey(sessionId)));
  return result.changes > 0;
}

export function applyBotCounterCommand(sessionKey: string, message: string, isDj: boolean) {
  const command = parseCounterCommand(message, isDj);
  if (!command) return null;
  const workspaceKey = getWorkspaceKey(sessionKey);

  if (command.kind === "query") {
    const row = getDatabase().prepare(`
      SELECT name, value FROM bot_counters
      WHERE session_key = ? AND name = ? COLLATE NOCASE
    `).get(workspaceKey, command.name) as Pick<BotCounter, "name" | "value"> | undefined;
    return row ? formatCounterAdjustment(row.name, row.value) : null;
  }

  const counter = getDatabase().prepare(`
    SELECT name FROM bot_counters
    WHERE session_key = ? AND name = ? COLLATE NOCASE
  `).get(workspaceKey, command.adjustment.name) as Pick<BotCounter, "name"> | undefined;
  if (!counter) return null;
  if (command.kind === "denied") return `${counter.name} 변경은 DJ만 할 수 있습니다.`;

  const row = getDatabase().prepare(`
    UPDATE bot_counters
    SET value = MIN(1000000, MAX(0, value + ?))
    WHERE session_key = ? AND name = ? COLLATE NOCASE
    RETURNING name, value
  `).get(command.adjustment.delta, workspaceKey, command.adjustment.name) as Pick<BotCounter, "name" | "value"> | undefined;
  return row ? formatCounterAdjustment(row.name, row.value) : null;
}

export function listSongRequestsByKey(sessionKey: string): SongRequest[] {
  const workspaceKey = getWorkspaceKey(sessionKey);
  return getDatabase().prepare(`
    SELECT id, requester_nickname, title, artist, created_at
    FROM song_requests
    WHERE session_key = ?
    ORDER BY id
  `).all(workspaceKey).map((row) => {
    const request = row as {
      id: number;
      requester_nickname: string;
      title: string;
      artist: string;
      created_at: number;
    };
    return {
      id: request.id,
      requesterNickname: request.requester_nickname,
      title: request.title,
      artist: request.artist,
      createdAt: request.created_at,
    };
  });
}

export function listSongRequests(sessionId: string) {
  return listSongRequestsByKey(getSessionKey(sessionId));
}

export function deleteSongRequest(sessionId: string, id: number) {
  const result = getDatabase().prepare(
    "DELETE FROM song_requests WHERE id = ? AND session_key = ?",
  ).run(id, getWorkspaceKey(getSessionKey(sessionId)));
  return result.changes > 0;
}

export function clearSongRequests(sessionId: string) {
  return getDatabase().prepare(
    "DELETE FROM song_requests WHERE session_key = ?",
  ).run(getWorkspaceKey(getSessionKey(sessionId))).changes;
}

export function applySongRequestCommand(
  sessionKey: string,
  message: string,
  isDj: boolean,
  requesterNickname: string | null,
) {
  const command = parseSongRequestCommand(message);
  if (!command) return null;
  if (command.kind === "usage") {
    return "사용법: !신청곡 곡명-가수 / !신청곡 목록 / DJ: !신청곡 삭제 번호";
  }

  const database = getDatabase();
  const workspaceKey = getWorkspaceKey(sessionKey);
  if (command.kind === "list") {
    const requests = listSongRequestsByKey(sessionKey);
    if (requests.length === 0) return ["신청곡 목록이 비어 있습니다."];

    const replies: string[] = [];
    for (const request of requests) {
      const label = `#${request.id} ${request.title}${request.artist ? ` - ${request.artist}` : ""}`;
      const prefix = replies.length === 0 ? "신청곡 목록: " : "신청곡 계속: ";
      const current = replies.at(-1);
      if (!current || `${current}, ${label}`.length > 200) {
        replies.push(`${prefix}${label}`);
      } else {
        replies[replies.length - 1] = `${current}, ${label}`;
      }
    }
    return replies;
  }
  if (command.kind === "delete") {
    if (!isDj) return "신청곡 삭제는 DJ만 할 수 있습니다.";
    const result = database.prepare(
      "DELETE FROM song_requests WHERE id = ? AND session_key = ?",
    ).run(command.id, workspaceKey);
    return result.changes > 0
      ? `신청곡 #${command.id}을 삭제했습니다.`
      : `신청곡 #${command.id}을 찾지 못했습니다.`;
  }

  const row = database.prepare(`
    INSERT INTO song_requests (session_key, requester_nickname, title, artist, created_at)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `).get(
    workspaceKey,
    requesterNickname?.trim().slice(0, 50) || "청취자",
    command.title,
    command.artist,
    Date.now(),
  ) as { id: number };
  return `신청곡 #${row.id} ${command.title} - ${command.artist} 접수 완료!`;
}

function getRouletteSettingsByKey(sessionKey: string): RouletteSettings {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  database.prepare(`
    INSERT OR IGNORE INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
    VALUES (?, 0, 20, 0)
  `).run(workspaceKey);
  const row = database.prepare(`
    SELECT enabled, cost, miss_weight FROM roulette_settings WHERE workspace_key = ?
  `).get(workspaceKey) as { enabled: number; cost: number; miss_weight: number };
  return {
    enabled: row.enabled === 1,
    cost: row.cost,
    missWeight: row.miss_weight,
  };
}

export function getRouletteSettings(sessionId: string) {
  return getRouletteSettingsByKey(getSessionKey(sessionId));
}

export function updateRouletteSettings(sessionId: string, settings: RouletteSettings) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  getDatabase().prepare(`
    INSERT INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_key) DO UPDATE SET
      enabled = excluded.enabled,
      cost = excluded.cost,
      miss_weight = excluded.miss_weight
  `).run(workspaceKey, settings.enabled ? 1 : 0, settings.cost, settings.missWeight);
}

export function listRouletteItems(sessionId: string): RouletteItem[] {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  return getDatabase().prepare(`
    SELECT id, label, weight FROM roulette_items
    WHERE workspace_key = ? ORDER BY created_at, id
  `).all(workspaceKey).map((row) => {
    const item = row as { id: number; label: string; weight: number };
    return { id: item.id, label: item.label, weight: item.weight };
  });
}

export function saveRouletteItem(
  sessionId: string,
  id: number | null,
  label: string,
  weight: number,
) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  try {
    if (id === null) {
      database.prepare(`
        INSERT INTO roulette_items (workspace_key, label, weight, created_at)
        VALUES (?, ?, ?, ?)
      `).run(workspaceKey, label, weight, Date.now());
      return true;
    }
    const result = database.prepare(`
      UPDATE roulette_items SET label = ?, weight = ?
      WHERE id = ? AND workspace_key = ?
    `).run(label, weight, id, workspaceKey);
    return result.changes > 0;
  } catch {
    return false;
  }
}

export function deleteRouletteItem(sessionId: string, id: number) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  return getDatabase().prepare(`
    DELETE FROM roulette_items WHERE id = ? AND workspace_key = ?
  `).run(id, workspaceKey).changes > 0;
}

export function deleteRouletteDistributionItem(sessionId: string, id: number) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    const item = database.prepare(`
      SELECT weight FROM roulette_items WHERE id = ? AND workspace_key = ?
    `).get(id, workspaceKey) as { weight: number } | undefined;
    if (!item) {
      database.exec("ROLLBACK");
      return false;
    }
    database.prepare("DELETE FROM roulette_items WHERE id = ? AND workspace_key = ?")
      .run(id, workspaceKey);
    database.prepare(`
      INSERT INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
      VALUES (?, 0, 20, ?)
      ON CONFLICT(workspace_key) DO UPDATE SET
        miss_weight = roulette_settings.miss_weight + excluded.miss_weight
    `).run(workspaceKey, item.weight);
    database.exec("COMMIT");
    return true;
  } catch {
    database.exec("ROLLBACK");
    return false;
  }
}

export function updateRouletteDistribution(
  sessionId: string,
  missPercentage: number,
  items: Array<{ label: string; percentage: number }>,
) {
  if (
    !Number.isSafeInteger(missPercentage)
    || missPercentage < 0
    || items.some((item) => (
      item.label.length < 1
      || item.label.length > 50
      || /[\r\n]/u.test(item.label)
      || !Number.isSafeInteger(item.percentage)
      || item.percentage < 1
    ))
    || missPercentage + items.reduce((total, item) => total + item.percentage, 0) !== 10_000
    || new Set(items.map((item) => item.label.toLocaleLowerCase("ko-KR"))).size !== items.length
  ) {
    return false;
  }

  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM roulette_items WHERE workspace_key = ?").run(workspaceKey);
    const insert = database.prepare(`
      INSERT INTO roulette_items (workspace_key, label, weight, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const now = Date.now();
    items.forEach((item, index) => {
      insert.run(workspaceKey, item.label, item.percentage, now + index);
    });
    database.prepare(`
      INSERT INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
      VALUES (?, 0, 20, ?)
      ON CONFLICT(workspace_key) DO UPDATE SET miss_weight = excluded.miss_weight
    `).run(workspaceKey, missPercentage);
    database.exec("COMMIT");
    return true;
  } catch {
    database.exec("ROLLBACK");
    return false;
  }
}

export function listRouletteResults(sessionId: string, limit = 50): RouletteResult[] {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  return getDatabase().prepare(`
    SELECT id, user_id, nickname, item_label, is_miss, spoons, created_at
    FROM roulette_results WHERE workspace_key = ?
    ORDER BY id DESC LIMIT ?
  `).all(workspaceKey, Math.max(1, Math.min(limit, 200))).map((row) => {
    const result = row as {
      id: number;
      user_id: string;
      nickname: string;
      item_label: string | null;
      is_miss: number;
      spoons: number;
      created_at: number;
    };
    return {
      id: result.id,
      userId: result.user_id,
      nickname: result.nickname,
      itemLabel: result.item_label,
      isMiss: result.is_miss === 1,
      spoons: result.spoons,
      createdAt: result.created_at,
    };
  });
}

export function listRouletteKeeps(sessionId: string): RouletteKeep[] {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  return getDatabase().prepare(`
    SELECT user_id, nickname, item_label, count, updated_at
    FROM roulette_keeps WHERE workspace_key = ?
    ORDER BY nickname COLLATE NOCASE, updated_at DESC, item_label COLLATE NOCASE
  `).all(workspaceKey).map((row) => {
    const keep = row as {
      user_id: string;
      nickname: string;
      item_label: string;
      count: number;
      updated_at: number;
    };
    return {
      userId: keep.user_id,
      nickname: keep.nickname,
      itemLabel: keep.item_label,
      count: keep.count,
      updatedAt: keep.updated_at,
    };
  });
}

export type RouletteDraw = {
  nickname: string;
  itemLabel: string | null;
  isMiss: boolean;
  keepCount: number | null;
};

export function applyRouletteDonation(
  sessionKey: string,
  liveId: number,
  event: Extract<ParsedSseEvent, { event: "donation" }>,
  random: () => number = Math.random,
): RouletteDraw | null {
  const settings = getRouletteSettingsByKey(sessionKey);
  if (!settings.enabled || event.data.amount < settings.cost) return null;
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  const items = database.prepare(`
    SELECT id, label, weight FROM roulette_items
    WHERE workspace_key = ? ORDER BY created_at, id
  `).all(workspaceKey) as Array<{ id: number; label: string; weight: number }>;
  const itemWeight = items.reduce((total, item) => total + item.weight, 0);
  const totalWeight = itemWeight + settings.missWeight;
  if (totalWeight <= 0) return null;

  let ticket = Math.min(Math.max(random(), 0), 0.9999999999999999) * totalWeight;
  let selected: { id: number; label: string } | null = null;
  for (const item of items) {
    if (ticket < item.weight) {
      selected = item;
      break;
    }
    ticket -= item.weight;
  }
  const nickname = event.data.user.nickname?.trim().slice(0, 50) || "청취자";
  const eventId = event.id || createHash("sha256")
    .update(`roulette:${liveId}:${JSON.stringify(event.data)}`)
    .digest("hex");
  const now = Date.now();

  database.exec("BEGIN IMMEDIATE");
  try {
    const inserted = database.prepare(`
      INSERT OR IGNORE INTO roulette_results (
        workspace_key, live_id, event_id, user_id, nickname,
        item_label, is_miss, spoons, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceKey,
      liveId,
      eventId,
      event.data.user.id,
      nickname,
      selected?.label ?? null,
      selected ? 0 : 1,
      event.data.amount,
      now,
    );
    if (inserted.changes === 0) {
      database.exec("ROLLBACK");
      return null;
    }

    let keepCount: number | null = null;
    if (selected) {
      database.prepare(`
        INSERT INTO roulette_keeps (
          workspace_key, user_id, nickname, item_label, count, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(workspace_key, user_id, item_label) DO UPDATE SET
          nickname = excluded.nickname,
          count = roulette_keeps.count + 1,
          updated_at = excluded.updated_at
      `).run(workspaceKey, event.data.user.id, nickname, selected.label, now);
      keepCount = (database.prepare(`
        SELECT count FROM roulette_keeps
        WHERE workspace_key = ? AND user_id = ? AND item_label = ?
      `).get(workspaceKey, event.data.user.id, selected.label) as { count: number }).count;
    }
    database.exec("COMMIT");
    return {
      nickname,
      itemLabel: selected?.label ?? null,
      isMiss: selected === null,
      keepCount,
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getRouletteKeepCommandRepliesByKey(
  sessionKey: string,
  message: string,
  userId: string,
  nickname: string | null,
) {
  if (message.trim() !== "!내 킵") return null;
  const displayName = nickname?.trim() || "청취자";
  const workspaceKey = getWorkspaceKey(sessionKey);
  const keeps = getDatabase().prepare(`
    SELECT item_label, SUM(count) AS count
    FROM roulette_keeps
    WHERE workspace_key = ? AND user_id = ?
    GROUP BY item_label ORDER BY MAX(updated_at) DESC, item_label COLLATE NOCASE
  `).all(workspaceKey, userId) as Array<{ item_label: string; count: number }>;
  if (keeps.length === 0) return [`${displayName}님의 킵 목록이 비어 있습니다.`];

  const replies: string[] = [];
  for (const keep of keeps) {
    const label = `${keep.item_label} ${keep.count.toLocaleString("ko-KR")}개`;
    const prefix = replies.length === 0 ? `${displayName}님의 킵: ` : "킵 계속: ";
    const current = replies.at(-1);
    if (!current || `${current}, ${label}`.length > 200) {
      replies.push(`${prefix}${label}`);
    } else {
      replies[replies.length - 1] = `${current}, ${label}`;
    }
  }
  return replies;
}

export function getRpsRoundByKey(sessionKey: string): RpsRound | null {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const row = getDatabase().prepare(`
    SELECT round_id, dj_choice, active, started_at, ended_at
    FROM rps_rounds WHERE workspace_key = ?
    ORDER BY active DESC, round_id DESC LIMIT 1
  `).get(workspaceKey) as {
    round_id: number;
    dj_choice: RpsChoice;
    active: number;
    started_at: number;
    ended_at: number | null;
  } | undefined;
  if (!row) return null;
  const entries = getDatabase().prepare(`
    SELECT user_id, nickname, choice, result
    FROM rps_entries
    WHERE workspace_key = ? AND round_id = ?
    ORDER BY created_at, user_id
  `).all(workspaceKey, row.round_id).map((entry) => {
    const value = entry as {
      user_id: string;
      nickname: string;
      choice: RpsChoice;
      result: RpsResult;
    };
    return {
      userId: value.user_id,
      nickname: value.nickname,
      choice: value.choice,
      result: value.result,
    };
  });
  return {
    roundId: row.round_id,
    active: row.active === 1,
    djChoice: row.dj_choice,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    entries,
  };
}

export function getRpsRound(sessionId: string) {
  return getRpsRoundByKey(getSessionKey(sessionId));
}

export function listRpsRounds(sessionId: string, limit = 10) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const rows = getDatabase().prepare(`
    SELECT round_id, dj_choice, active, started_at, ended_at
    FROM rps_rounds WHERE workspace_key = ?
    ORDER BY round_id DESC LIMIT ?
  `).all(workspaceKey, Math.max(1, Math.min(limit, 50))) as Array<{
    round_id: number;
    dj_choice: RpsChoice;
    active: number;
    started_at: number;
    ended_at: number | null;
  }>;
  const entriesStatement = getDatabase().prepare(`
    SELECT user_id, nickname, choice, result
    FROM rps_entries WHERE workspace_key = ? AND round_id = ?
    ORDER BY created_at, user_id
  `);
  return rows.map((row) => ({
    roundId: row.round_id,
    active: row.active === 1,
    djChoice: row.dj_choice,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    entries: entriesStatement.all(workspaceKey, row.round_id).map((entry) => {
      const value = entry as {
        user_id: string;
        nickname: string;
        choice: RpsChoice;
        result: RpsResult;
      };
      return {
        userId: value.user_id,
        nickname: value.nickname,
        choice: value.choice,
        result: value.result,
      };
    }),
  } satisfies RpsRound));
}

export function startRpsRound(sessionId: string, djChoice: RpsChoice) {
  const sessionKey = getSessionKey(sessionId);
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  const current = getRpsRoundByKey(sessionKey);
  if (current?.active) return false;
  const roundId = (current?.roundId ?? 0) + 1;
  database.prepare(`
    INSERT INTO rps_rounds (workspace_key, round_id, dj_choice, active, started_at, ended_at)
    VALUES (?, ?, ?, 1, ?, NULL)
  `).run(workspaceKey, roundId, djChoice, Date.now());
  return true;
}

export function finishRpsRound(sessionId: string) {
  const sessionKey = getSessionKey(sessionId);
  const workspaceKey = getWorkspaceKey(sessionKey);
  const result = getDatabase().prepare(`
    UPDATE rps_rounds SET active = 0, ended_at = ?
    WHERE workspace_key = ? AND active = 1
  `).run(Date.now(), workspaceKey);
  return result.changes > 0 ? getRpsRoundByKey(sessionKey) : null;
}

export function applyRpsCommand(
  sessionKey: string,
  message: string,
  isDj: boolean,
  userId: string,
  nickname: string | null,
) {
  const choice = parseRpsCommand(message);
  if (!choice) return null;
  if (choice === "usage") return "사용법: !가위바위보 가위|바위|보";
  if (isDj) return "DJ는 Game 화면에서 가위바위보를 시작하고 종료해 주세요.";

  const round = getRpsRoundByKey(sessionKey);
  if (!round?.active) return "현재 진행 중인 가위바위보가 없습니다.";
  const workspaceKey = getWorkspaceKey(sessionKey);
  const result = getRpsResult(choice, round.djChoice);
  const inserted = getDatabase().prepare(`
    INSERT OR IGNORE INTO rps_entries (
      workspace_key, round_id, user_id, nickname, choice, result, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    workspaceKey,
    round.roundId,
    userId,
    nickname?.trim().slice(0, 50) || "청취자",
    choice,
    result,
    Date.now(),
  );
  return inserted.changes > 0
    ? `${nickname?.trim() || "청취자"}님, 가위바위보 참여 완료! 결과는 라운드 종료 후 공개됩니다.`
    : "이미 참여하셨습니다.";
}

export function isSessionBlockedByKey(sessionKey: string) {
  const row = getDatabase().prepare("SELECT blocked FROM oauth_sessions WHERE id_hash = ?")
    .get(sessionKey) as Pick<SessionRow, "blocked"> | undefined;
  return row?.blocked === 1;
}

export function isSessionBlocked(sessionId: string | undefined) {
  return sessionId ? isSessionBlockedByKey(getSessionKey(sessionId)) : false;
}

export function setSessionBlockedByKey(sessionKey: string, blocked: boolean) {
  const result = getDatabase().prepare(`
    UPDATE oauth_sessions
    SET blocked = ?, bot_enabled = CASE WHEN ? = 1 THEN 0 ELSE bot_enabled END, updated_at = ?
    WHERE id_hash = ?
  `).run(blocked ? 1 : 0, blocked ? 1 : 0, Date.now(), sessionKey);
  return result.changes > 0;
}

export function listAdminSessions(): AdminSession[] {
  const rows = getDatabase().prepare(`
    SELECT o.id_hash, o.bot_enabled, o.blocked, o.created_at, o.updated_at,
           COALESCE(s.dj_nickname, '') AS dj_nickname
    FROM oauth_sessions o
    LEFT JOIN bot_settings s ON s.session_key = COALESCE(o.workspace_key, o.id_hash)
    ORDER BY o.updated_at DESC
  `).all() as Array<{
    id_hash: string;
    dj_nickname: string;
    bot_enabled: number;
    blocked: number;
    created_at: number;
    updated_at: number;
  }>;
  return rows.map((row) => ({
    sessionKey: row.id_hash,
    djNickname: row.dj_nickname,
    botEnabled: row.bot_enabled === 1,
    blocked: row.blocked === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function deleteAuthSessionByKey(sessionKey: string) {
  getDatabase().prepare("DELETE FROM oauth_sessions WHERE id_hash = ?").run(sessionKey);
}

export function deleteAuthSession(sessionId: string) {
  deleteAuthSessionByKey(getSessionKey(sessionId));
}