import "server-only";

import { randomBytes } from "node:crypto";

import { type SpoonToken } from "../spoon";
import {
  decryptToken,
  encryptToken,
  SessionConfigurationError,
  type StoredSpoonToken,
} from "../session";
import {
  type SessionRow,
  getDatabase,
  getSessionKey,
  getWorkspaceKey,
} from "./db";

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

function decryptStoredToken(sessionKey: string, payload: string): StoredSpoonToken | null {
  try {
    return decryptToken(payload);
  } catch (error) {
    if (error instanceof SessionConfigurationError) throw error;
    // Only mark the login invalid: deleting the row would also drop the link to
    // the DJ's saved data, and a rotated or mistyped SESSION_SECRET would wipe
    // every session at boot. Reconnecting replaces the token.
    invalidateAuthSessionByKey(sessionKey);
    console.error("Stored Spoon token could not be decrypted; marking the session for reconnect");
    return null;
  }
}

export function getSessionByKey(sessionKey: string): StoredSpoonToken | null {
  const row = getDatabase()
    .prepare("SELECT token_payload, auth_valid FROM oauth_sessions WHERE id_hash = ?")
    .get(sessionKey) as SessionRow | undefined;

  if (!row || row.auth_valid !== 1) return null;
  return decryptStoredToken(sessionKey, row.token_payload);
}

export function saveSession(currentSessionId: string | undefined, token: SpoonToken) {
  const now = Date.now();

  if (currentSessionId) {
    const sessionKey = getSessionKey(currentSessionId);
    getDatabase().prepare(`
      INSERT INTO oauth_sessions (id_hash, token_payload, workspace_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id_hash) DO UPDATE SET
        token_payload = excluded.token_payload,
        auth_valid = 1,
        updated_at = excluded.updated_at
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

// Sessions of one DJ (a linked workspace, e.g. PC and phone) share one Spoon
// token pair, following Spoon's advice to keep a single token set per DJ.
// Sessions not yet linked to a DJ stand alone.
function listDjPeerSessionKeys(sessionKey: string) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  if (!database.prepare("SELECT 1 FROM dj_workspaces WHERE workspace_key = ?").get(workspaceKey)) return [];
  return (database.prepare(`
    SELECT id_hash FROM oauth_sessions
    WHERE COALESCE(workspace_key, id_hash) = ? AND id_hash != ? AND blocked = 0 AND auth_valid = 1
  `).all(workspaceKey, sessionKey) as Array<{ id_hash: string }>).map((row) => row.id_hash);
}

function writeTokenPayload(sessionKey: string, payload: string) {
  return getDatabase()
    // Only a still-valid session: a refresh racing a disconnect must not revive it.
    .prepare("UPDATE oauth_sessions SET token_payload = ?, updated_at = ? WHERE id_hash = ? AND auth_valid = 1")
    .run(payload, Date.now(), sessionKey).changes > 0;
}

// Stores a refreshed token. Refresh tokens rotate, so the DJ's other sessions
// must receive the new pair too or their next refresh would fail.
export function updateSessionByKey(sessionKey: string, token: SpoonToken) {
  const payload = encryptToken(token);
  if (!writeTokenPayload(sessionKey, payload)) return false;
  for (const peerKey of listDjPeerSessionKeys(sessionKey)) writeTokenPayload(peerKey, payload);
  return true;
}

// After a login: hands this session's new token to the DJ's other sessions and
// returns their previous refresh tokens, which the caller should revoke.
export function adoptTokenForDjSessions(sessionKey: string) {
  const row = getDatabase().prepare("SELECT token_payload FROM oauth_sessions WHERE id_hash = ? AND auth_valid = 1")
    .get(sessionKey) as Pick<SessionRow, "token_payload"> | undefined;
  const current = getSessionByKey(sessionKey);
  if (!row || !current) return [];
  const staleRefreshTokens = new Set<string>();
  for (const peerKey of listDjPeerSessionKeys(sessionKey)) {
    const previous = getSessionByKey(peerKey);
    if (previous && previous.refresh_token !== current.refresh_token) staleRefreshTokens.add(previous.refresh_token);
    writeTokenPayload(peerKey, row.token_payload);
  }
  return [...staleRefreshTokens];
}

// The DJ's sessions share one token, so disconnecting signs out all of them.
export function invalidateDjSessionsByKey(sessionKey: string) {
  for (const peerKey of listDjPeerSessionKeys(sessionKey)) invalidateAuthSessionByKey(peerKey);
  invalidateAuthSessionByKey(sessionKey);
}

// Refreshes for sessions sharing a token must not run concurrently: the second
// would present an already-rotated refresh token.
export function getTokenGroupKey(sessionKey: string) {
  return getWorkspaceKey(sessionKey);
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
  return isBotEnabledByKey(getSessionKey(sessionId));
}

export function isBotEnabledByKey(sessionKey: string) {
  const row = getDatabase()
    .prepare("SELECT bot_enabled FROM oauth_sessions WHERE id_hash = ?")
    .get(sessionKey) as Pick<SessionRow, "bot_enabled"> | undefined;
  return row?.bot_enabled === 1;
}

export function getCurrentLiveIdByKey(sessionKey: string) {
  const row = getDatabase().prepare(
    "SELECT current_live_id FROM oauth_sessions WHERE id_hash = ?",
  ).get(sessionKey) as Pick<SessionRow, "current_live_id"> | undefined;
  return row?.current_live_id ?? undefined;
}

export function getLatestAudienceLiveIdByKey(sessionKey: string) {
  const row = getDatabase().prepare(`
    SELECT live_id
    FROM audience_events
    WHERE workspace_key = ?
    ORDER BY occurred_at DESC
    LIMIT 1
  `).get(getWorkspaceKey(sessionKey)) as { live_id: number } | undefined;
  return row?.live_id;
}

export function setCurrentLiveIdByKey(sessionKey: string, liveId: number | undefined) {
  getDatabase().prepare(
    "UPDATE oauth_sessions SET current_live_id = ?, updated_at = ? WHERE id_hash = ?",
  ).run(liveId ?? null, Date.now(), sessionKey);
}

export function listEnabledBotSessions(): EnabledBotSession[] {
  // Most recent first, so when one DJ has several enabled sessions (several
  // devices), only the latest is restored and the rest are switched off.
  const rows = getDatabase()
    .prepare(`
      SELECT id_hash, token_payload, COALESCE(workspace_key, id_hash) AS workspace_key
      FROM oauth_sessions WHERE bot_enabled = 1 AND blocked = 0 AND auth_valid = 1
      ORDER BY updated_at DESC
    `)
    .all() as Array<Pick<SessionRow, "id_hash" | "token_payload"> & { workspace_key: string }>;

  const seenWorkspaces = new Set<string>();
  return rows.flatMap((row) => {
    if (seenWorkspaces.has(row.workspace_key)) {
      setBotEnabledByKey(row.id_hash, false);
      return [];
    }
    const token = decryptStoredToken(row.id_hash, row.token_payload);
    if (!token) return [];
    seenWorkspaces.add(row.workspace_key);
    return [{ sessionKey: row.id_hash, token }];
  });
}

// The DJ's devices share one workspace and one bot. Returns the session that
// currently runs the bot for this session's workspace (preferring this one).
export function getWorkspaceBotSessionKey(sessionKey: string) {
  const row = getDatabase().prepare(`
    SELECT id_hash FROM oauth_sessions
    WHERE COALESCE(workspace_key, id_hash) = ? AND bot_enabled = 1 AND blocked = 0 AND auth_valid = 1
    ORDER BY id_hash = ? DESC, updated_at DESC LIMIT 1
  `).get(getWorkspaceKey(sessionKey), sessionKey) as { id_hash: string } | undefined;
  return row?.id_hash ?? null;
}

export function listOtherWorkspaceSessionKeys(sessionKey: string) {
  return (getDatabase().prepare(`
    SELECT id_hash FROM oauth_sessions
    WHERE COALESCE(workspace_key, id_hash) = ? AND id_hash != ?
  `).all(getWorkspaceKey(sessionKey), sessionKey) as Array<{ id_hash: string }>)
    .map((row) => row.id_hash);
}

export function getSessionDjUserIdByKey(sessionKey: string) {
  const row = getDatabase().prepare("SELECT dj_user_id FROM oauth_sessions WHERE id_hash = ?")
    .get(sessionKey) as { dj_user_id: string | null } | undefined;
  return row?.dj_user_id ?? null;
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

export function invalidateAuthSessionByKey(sessionKey: string) {
  getDatabase().prepare(
    "UPDATE oauth_sessions SET auth_valid = 0, updated_at = ? WHERE id_hash = ?",
  ).run(Date.now(), sessionKey);
}

export function deleteAuthSession(sessionId: string) {
  deleteAuthSessionByKey(getSessionKey(sessionId));
}

export function invalidateStoredAuthSession(sessionId: string) {
  invalidateAuthSessionByKey(getSessionKey(sessionId));
}
