import "server-only";

import {
  forceRefreshAuthSession,
  invalidateAuthSession,
} from "./auth";
import {
  getCurrentLive,
  SpoonApiErrorResponse,
  type SpoonLive,
} from "./spoon";
import type { StoredSpoonToken } from "./session";

export type LiveStatus =
  | { kind: "live"; live: SpoonLive }
  | { kind: "offline" }
  | { kind: "missing_scope" }
  | { kind: "unavailable" };

type LiveStatusResult = {
  session: StoredSpoonToken | null;
  status: LiveStatus | null;
  authenticationExpired: boolean;
};

function classifyError(error: unknown): LiveStatus {
  if (error instanceof SpoonApiErrorResponse && error.status === 403) {
    return { kind: "missing_scope" };
  }

  return { kind: "unavailable" };
}

export async function loadLiveStatus(
  sessionId: string | undefined,
  session: StoredSpoonToken | null,
): Promise<LiveStatusResult> {
  if (!sessionId || !session) {
    return { session, status: null, authenticationExpired: false };
  }

  if (!session.scope.split(" ").includes("live.read")) {
    return { session, status: { kind: "missing_scope" }, authenticationExpired: false };
  }

  try {
    const live = await getCurrentLive(session.access_token);
    return {
      session,
      status: live ? { kind: "live", live } : { kind: "offline" },
      authenticationExpired: false,
    };
  } catch (error) {
    if (!(error instanceof SpoonApiErrorResponse) || error.status !== 401) {
      return { session, status: classifyError(error), authenticationExpired: false };
    }
  }

  const refreshed = await forceRefreshAuthSession(sessionId);
  if (!refreshed) {
    return { session: null, status: null, authenticationExpired: true };
  }

  try {
    const live = await getCurrentLive(refreshed.access_token);
    return {
      session: refreshed,
      status: live ? { kind: "live", live } : { kind: "offline" },
      authenticationExpired: false,
    };
  } catch (error) {
    if (error instanceof SpoonApiErrorResponse && error.status === 401) {
      invalidateAuthSession(sessionId);
      return { session: null, status: null, authenticationExpired: true };
    }

    return { session: refreshed, status: classifyError(error), authenticationExpired: false };
  }
}