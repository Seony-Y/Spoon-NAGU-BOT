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
  token_payload: string;
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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  globalForDatabase.naguSessionDatabase = database;
  return database;
}

function hashSessionId(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("hex");
}

function readStoredToken(sessionId: string): StoredSpoonToken | null {
  const row = getDatabase()
    .prepare("SELECT token_payload FROM oauth_sessions WHERE id_hash = ?")
    .get(hashSessionId(sessionId)) as SessionRow | undefined;

  if (!row) return null;

  try {
    return decryptToken(row.token_payload);
  } catch (error) {
    if (error instanceof SessionConfigurationError) throw error;
    deleteSession(sessionId);
    return null;
  }
}

export function saveSession(currentSessionId: string | undefined, token: SpoonToken) {
  const now = Date.now();

  if (currentSessionId && readStoredToken(currentSessionId)) {
    getDatabase()
      .prepare("UPDATE oauth_sessions SET token_payload = ?, updated_at = ? WHERE id_hash = ?")
      .run(encryptToken(token), now, hashSessionId(currentSessionId));
    return currentSessionId;
  }

  const sessionId = randomBytes(32).toString("base64url");
  getDatabase()
    .prepare("INSERT INTO oauth_sessions (id_hash, token_payload, created_at, updated_at) VALUES (?, ?, ?, ?)")
    .run(hashSessionId(sessionId), encryptToken(token), now, now);
  return sessionId;
}

export function getSession(sessionId: string | undefined) {
  return sessionId ? readStoredToken(sessionId) : null;
}

export function updateSession(sessionId: string, token: SpoonToken) {
  const result = getDatabase()
    .prepare("UPDATE oauth_sessions SET token_payload = ?, updated_at = ? WHERE id_hash = ?")
    .run(encryptToken(token), Date.now(), hashSessionId(sessionId));
  return result.changes > 0;
}

export function deleteSession(sessionId: string) {
  getDatabase()
    .prepare("DELETE FROM oauth_sessions WHERE id_hash = ?")
    .run(hashSessionId(sessionId));
}