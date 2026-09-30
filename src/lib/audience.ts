import "server-only";

import { forceRefreshAuthSession, invalidateAuthSession } from "./auth";
import {
  getLiveFans,
  getLiveListenersPage,
  SpoonApiErrorResponse,
  type SpoonFan,
  type SpoonListener,
} from "./spoon";
import type { StoredSpoonToken } from "./session";

export type AudienceSection<T> =
  | { kind: "ready"; items: T[] }
  | { kind: "offline" }
  | { kind: "missing_scope" }
  | { kind: "unavailable" }
  | { kind: "unauthorized" };

export type AudienceStatus = {
  session: StoredSpoonToken | null;
  listeners: AudienceSection<SpoonListener>;
  fans: AudienceSection<SpoonFan>;
  authenticationExpired: boolean;
};

async function getAllListeners(accessToken: string) {
  const listeners: SpoonListener[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await getLiveListenersPage(accessToken, cursor);
    listeners.push(...page.listeners);
    if (!page.nextCursor) break;
    if (seenCursors.has(page.nextCursor)) throw new Error("Repeated Spoon listener cursor");
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);

  return listeners;
}

function classifyAudienceError<T>(error: unknown): AudienceSection<T> {
  if (!(error instanceof SpoonApiErrorResponse)) return { kind: "unavailable" };
  if (error.status === 401) return { kind: "unauthorized" };
  if (error.status === 403) return { kind: "missing_scope" };
  if (error.status === 404) return { kind: "offline" };
  return { kind: "unavailable" };
}

async function loadSection<T>(enabled: boolean, loader: () => Promise<T[]>) {
  if (!enabled) return { kind: "missing_scope" } as AudienceSection<T>;
  try {
    return { kind: "ready", items: await loader() } as AudienceSection<T>;
  } catch (error) {
    return classifyAudienceError<T>(error);
  }
}

async function loadWithToken(session: StoredSpoonToken) {
  const scopes = session.scope.split(" ");
  const [listeners, fans] = await Promise.all([
    loadSection(scopes.includes("listeners.read"), () => getAllListeners(session.access_token)),
    loadSection(scopes.includes("fans.read"), async () => (await getLiveFans(session.access_token)).fans),
  ]);
  return { listeners, fans };
}

export async function loadAudienceStatus(
  sessionId: string | undefined,
  session: StoredSpoonToken | null,
): Promise<AudienceStatus> {
  const empty = {
    listeners: { kind: "missing_scope" } as AudienceSection<SpoonListener>,
    fans: { kind: "missing_scope" } as AudienceSection<SpoonFan>,
  };
  if (!sessionId || !session) {
    return { session, ...empty, authenticationExpired: false };
  }

  let sections = await loadWithToken(session);
  const unauthorized = sections.listeners.kind === "unauthorized" || sections.fans.kind === "unauthorized";
  if (!unauthorized) return { session, ...sections, authenticationExpired: false };

  const refreshed = await forceRefreshAuthSession(sessionId);
  if (!refreshed) return { session: null, ...empty, authenticationExpired: true };

  sections = await loadWithToken(refreshed);
  const stillUnauthorized = sections.listeners.kind === "unauthorized" || sections.fans.kind === "unauthorized";
  if (stillUnauthorized) {
    invalidateAuthSession(sessionId);
    return { session: null, ...empty, authenticationExpired: true };
  }

  return { session: refreshed, ...sections, authenticationExpired: false };
}