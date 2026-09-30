import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
};

export type EnabledBotSession = {
  sessionKey: string;
  token: StoredSpoonToken;
};

const globalForDatabase = globalThis as typeof globalThis & {
  naguSessionDatabase?: DatabaseSync;
};

function getDatabase() {
  if (globalForDatabase.naguSessionDatabase) {
    return globalForDatabase.naguSessionDatabase;
  }

  const databasePath = resolve(
    /* turbopackIgnore: true */ process.env.SESSION_STORE_PATH || ".data/nagu.db",
  );
  mkdirSync(dirname(databasePath), { recursive: true });

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS oauth_sessions (
      id_hash TEXT PRIMARY KEY,
      token_payload TEXT NOT NULL,
      bot_enabled INTEGER NOT NULL DEFAULT 0,
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
    deleteSessionByKey(sessionKey);
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

  if (currentSessionId && getSession(currentSessionId)) {
    getDatabase()
      .prepare("UPDATE oauth_sessions SET token_payload = ?, updated_at = ? WHERE id_hash = ?")
      .run(encryptToken(token), now, getSessionKey(currentSessionId));
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
  getDatabase()
    .prepare("DELETE FROM oauth_sessions WHERE id_hash = ?")
    .run(sessionKey);
}

export function deleteSession(sessionId: string) {
  deleteSessionByKey(getSessionKey(sessionId));
}

export function setBotEnabled(sessionId: string, enabled: boolean) {
  const result = getDatabase()
    .prepare("UPDATE oauth_sessions SET bot_enabled = ?, updated_at = ? WHERE id_hash = ?")
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
    .prepare("SELECT id_hash, token_payload, bot_enabled FROM oauth_sessions WHERE bot_enabled = 1")
    .all() as SessionRow[];

  return rows.flatMap((row) => {
    const token = decryptStoredToken(row.id_hash, row.token_payload);
    return token ? [{ sessionKey: row.id_hash, token }] : [];
  });
}