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

type SessionRow = {
  id_hash: string;
  token_payload: string;
  bot_enabled: number;
  blocked: number;
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
  initialValue: number;
  value: number;
};

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
    CREATE TABLE IF NOT EXISTS app_migrations (
      key TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
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
    getDatabase().prepare(`
      INSERT INTO oauth_sessions (id_hash, token_payload, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id_hash) DO UPDATE SET token_payload = excluded.token_payload, updated_at = excluded.updated_at
    `).run(getSessionKey(currentSessionId), encryptToken(token), now, now);
    return currentSessionId;
  }

  const sessionId = randomBytes(32).toString("base64url");
  getDatabase()
    .prepare("INSERT INTO oauth_sessions (id_hash, token_payload, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(getSessionKey(sessionId), encryptToken(token), now, now);
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
  const database = getDatabase();
  database.prepare("DELETE FROM bot_counters WHERE session_key = ?").run(sessionKey);
  database.prepare("DELETE FROM bot_commands WHERE session_key = ?").run(sessionKey);
  database.prepare("DELETE FROM bot_settings WHERE session_key = ?").run(sessionKey);
  database
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
  database.prepare(`
    INSERT OR IGNORE INTO bot_settings (session_key, repeat_interval_minutes) VALUES (?, 10)
  `).run(sessionKey);
  const settings = database.prepare("SELECT * FROM bot_settings WHERE session_key = ?")
    .get(sessionKey) as BotSettingsRow;

  if (settings.commands_initialized === 0) {
    const insert = database.prepare(
      "INSERT OR IGNORE INTO bot_commands (session_key, command, response) VALUES (?, ?, ?)",
    );
    insert.run(sessionKey, "!안녕", "{nickname}님, 반가워요!");
    insert.run(sessionKey, "!명령어", "사용 가능한 명령어를 확인해 주세요.");
    database.prepare("UPDATE bot_settings SET commands_initialized = 1 WHERE session_key = ?")
      .run(sessionKey);
  }
  database.prepare(`
    INSERT OR IGNORE INTO bot_counters (session_key, name, initial_value, value)
    VALUES (?, '실드', 0, 0)
  `).run(sessionKey);

  return settings;
}

export function getBotSettingsByKey(sessionKey: string): BotSettings {
  const row = ensureBotSettings(sessionKey);
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
  ensureBotSettings(getSessionKey(sessionId));
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
    getSessionKey(sessionId),
  );
}

export function updateDjNicknameByKey(sessionKey: string, nickname: string) {
  const normalized = nickname.trim().slice(0, 50);
  if (!normalized) return;
  ensureBotSettings(sessionKey);
  getDatabase().prepare("UPDATE bot_settings SET dj_nickname = ? WHERE session_key = ?")
    .run(normalized, sessionKey);
}

export function listBotCommandsByKey(sessionKey: string): BotCommand[] {
  ensureBotSettings(sessionKey);
  return getDatabase().prepare(
    "SELECT command, response FROM bot_commands WHERE session_key = ? ORDER BY command",
  ).all(sessionKey) as BotCommand[];
}

export function listBotCommands(sessionId: string) {
  return listBotCommandsByKey(getSessionKey(sessionId));
}

export function upsertBotCommand(sessionId: string, command: string, response: string) {
  const sessionKey = getSessionKey(sessionId);
  ensureBotSettings(sessionKey);
  getDatabase().prepare(`
    INSERT INTO bot_commands (session_key, command, response) VALUES (?, ?, ?)
    ON CONFLICT(session_key, command) DO UPDATE SET response = excluded.response
  `).run(sessionKey, command, response);
}

export function deleteBotCommand(sessionId: string, command: string) {
  getDatabase().prepare("DELETE FROM bot_commands WHERE session_key = ? AND command = ?")
    .run(getSessionKey(sessionId), command);
}

export function findBotCommandResponse(sessionKey: string, message: string, nickname: string | null) {
  ensureBotSettings(sessionKey);
  const command = message.trim().toLocaleLowerCase("ko-KR");
  const row = getDatabase().prepare(
    "SELECT response FROM bot_commands WHERE session_key = ? AND command = ?",
  ).get(sessionKey, command) as Pick<BotCommand, "response"> | undefined;
  if (!row) return null;

  const response = row.response.replaceAll("{nickname}", nickname?.trim() || "청취자");
  return response.length <= 200 ? response : response.slice(0, 200);
}

export function listBotCountersByKey(sessionKey: string): BotCounter[] {
  return (getDatabase().prepare(`
    SELECT id, name, initial_value, value
    FROM bot_counters
    WHERE session_key = ?
    ORDER BY id
  `).all(sessionKey) as Array<{
    id: number;
    name: string;
    initial_value: number;
    value: number;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    initialValue: row.initial_value,
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
  initialValue: number,
  value: number,
) {
  const database = getDatabase();
  const sessionKey = getSessionKey(sessionId);
  try {
    if (id === null) {
      database.prepare(`
        INSERT INTO bot_counters (session_key, name, initial_value, value)
        VALUES (?, ?, ?, ?)
      `).run(sessionKey, name, initialValue, value);
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
    `).run(savedName, initialValue, value, id, sessionKey);
    return result.changes > 0;
  } catch {
    return false;
  }
}

export function resetBotCounter(sessionId: string, id: number) {
  const result = getDatabase().prepare(`
    UPDATE bot_counters SET value = initial_value WHERE id = ? AND session_key = ?
  `).run(id, getSessionKey(sessionId));
  return result.changes > 0;
}

export function deleteBotCounter(sessionId: string, id: number) {
  const result = getDatabase().prepare(
    "DELETE FROM bot_counters WHERE id = ? AND session_key = ? AND name != '실드' COLLATE NOCASE",
  ).run(id, getSessionKey(sessionId));
  return result.changes > 0;
}

export function applyBotCounterCommand(sessionKey: string, message: string, isDj: boolean) {
  const command = parseCounterCommand(message, isDj);
  if (!command) return null;

  if (command.kind === "query") {
    const row = getDatabase().prepare(`
      SELECT name, value FROM bot_counters
      WHERE session_key = ? AND name = ? COLLATE NOCASE
    `).get(sessionKey, command.name) as Pick<BotCounter, "name" | "value"> | undefined;
    return row ? formatCounterAdjustment(row.name, row.value) : null;
  }

  const counter = getDatabase().prepare(`
    SELECT name FROM bot_counters
    WHERE session_key = ? AND name = ? COLLATE NOCASE
  `).get(sessionKey, command.adjustment.name) as Pick<BotCounter, "name"> | undefined;
  if (!counter) return null;
  if (command.kind === "denied") return `${counter.name} 변경은 DJ만 할 수 있습니다.`;

  const row = getDatabase().prepare(`
    UPDATE bot_counters
    SET value = MIN(1000000, MAX(0, value + ?))
    WHERE session_key = ? AND name = ? COLLATE NOCASE
    RETURNING name, value
  `).get(command.adjustment.delta, sessionKey, command.adjustment.name) as Pick<BotCounter, "name" | "value"> | undefined;
  return row ? formatCounterAdjustment(row.name, row.value) : null;
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
    LEFT JOIN bot_settings s ON s.session_key = o.id_hash
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