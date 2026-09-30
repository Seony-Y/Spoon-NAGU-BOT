import "server-only";

import {
  refreshAccessToken,
  revokeToken,
  SpoonOAuthErrorResponse,
  type SpoonToken,
} from "./spoon";
import {
  deleteAuthSession,
  deleteAuthSessionByKey,
  getSession,
  getSessionByKey,
  getSessionKey,
  isSessionBlockedByKey,
  saveSession,
  updateSessionByKey,
} from "./session-store";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const refreshes = new Map<string, Promise<ReturnType<typeof getSession>>>();

export function createAuthSession(currentSessionId: string | undefined, token: SpoonToken) {
  return saveSession(currentSessionId, token);
}

async function refreshSessionByKey(sessionKey: string, force = false) {
  const current = getSessionByKey(sessionKey);
  if (!current || (!force && current.expires_at - Date.now() > REFRESH_MARGIN_MS)) return current;

  try {
    const refreshed = await refreshAccessToken(current.refresh_token);
    return updateSessionByKey(sessionKey, refreshed) ? getSessionByKey(sessionKey) : null;
  } catch (error) {
    if (error instanceof SpoonOAuthErrorResponse && error.code === "invalid_grant") {
      deleteAuthSessionByKey(sessionKey);
      return null;
    }

    if (current.expires_at > Date.now()) return current;
    throw error;
  }
}

async function getAuthSessionByKey(sessionKey: string, force = false) {
  if (isSessionBlockedByKey(sessionKey)) return null;
  const current = getSessionByKey(sessionKey);
  if (!current || (!force && current.expires_at - Date.now() > REFRESH_MARGIN_MS)) return current;

  const activeRefresh = refreshes.get(sessionKey);
  if (activeRefresh) return activeRefresh;

  const refresh = refreshSessionByKey(sessionKey, force)
    .finally(() => refreshes.delete(sessionKey));
  refreshes.set(sessionKey, refresh);
  return refresh;
}

export async function getAuthSession(sessionId: string | undefined) {
  if (!sessionId) return null;
  return getAuthSessionByKey(getSessionKey(sessionId));
}

export async function forceRefreshAuthSession(sessionId: string) {
  return getAuthSessionByKey(getSessionKey(sessionId), true);
}

export function getBotAuthSession(sessionKey: string, force = false) {
  return getAuthSessionByKey(sessionKey, force);
}

export function invalidateAuthSession(sessionId: string) {
  deleteAuthSession(sessionId);
}

export async function disconnectAuthSession(sessionId: string) {
  const current = getSession(sessionId);
  if (!current) return;

  await revokeToken(current.refresh_token);
  deleteAuthSession(sessionId);
}