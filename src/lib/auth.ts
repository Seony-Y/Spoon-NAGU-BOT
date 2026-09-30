import "server-only";

import {
  refreshAccessToken,
  revokeToken,
  SpoonOAuthErrorResponse,
  type SpoonToken,
} from "./spoon";
import { deleteSession, getSession, saveSession, updateSession } from "./session-store";

const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const refreshes = new Map<string, Promise<ReturnType<typeof getSession>>>();

export function createAuthSession(currentSessionId: string | undefined, token: SpoonToken) {
  return saveSession(currentSessionId, token);
}

async function refreshSession(sessionId: string, force = false) {
  const current = getSession(sessionId);
  if (!current || (!force && current.expires_at - Date.now() > REFRESH_MARGIN_MS)) return current;

  try {
    const refreshed = await refreshAccessToken(current.refresh_token);
    return updateSession(sessionId, refreshed) ? getSession(sessionId) : null;
  } catch (error) {
    if (error instanceof SpoonOAuthErrorResponse && error.code === "invalid_grant") {
      deleteSession(sessionId);
      return null;
    }

    if (current.expires_at > Date.now()) return current;
    throw error;
  }
}

export async function getAuthSession(sessionId: string | undefined) {
  if (!sessionId) return null;

  const current = getSession(sessionId);
  if (!current || current.expires_at - Date.now() > REFRESH_MARGIN_MS) return current;

  const activeRefresh = refreshes.get(sessionId);
  if (activeRefresh) return activeRefresh;

  const refresh = refreshSession(sessionId).finally(() => refreshes.delete(sessionId));
  refreshes.set(sessionId, refresh);
  return refresh;
}

export async function forceRefreshAuthSession(sessionId: string) {
  const activeRefresh = refreshes.get(sessionId);
  if (activeRefresh) return activeRefresh;

  const refresh = refreshSession(sessionId, true).finally(() => refreshes.delete(sessionId));
  refreshes.set(sessionId, refresh);
  return refresh;
}

export function invalidateAuthSession(sessionId: string) {
  deleteSession(sessionId);
}

export async function disconnectAuthSession(sessionId: string) {
  const current = getSession(sessionId);
  if (!current) return;

  await revokeToken(current.refresh_token);
  deleteSession(sessionId);
}