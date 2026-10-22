import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createAuthSession } from "@/lib/auth";
import { SESSION_COOKIE, SessionConfigurationError, STATE_COOKIE } from "@/lib/session";
import {
  adoptTokenForDjSessions,
  getSessionKey,
  isDjBlocked,
  isSessionBlocked,
  linkDjWorkspaceByKey,
  sessionBelongsToOtherDj,
} from "@/lib/session-store";
import {
  buildApplicationUrl,
  exchangeCode,
  getMissingRequiredScopes,
  getMyUserId,
  hasScope,
  revokeToken,
  type SpoonToken,
} from "@/lib/spoon";

export const runtime = "nodejs";

function statesMatch(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;

  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);

  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function redirectWithError(request: NextRequest, error: string) {
  const response = NextResponse.redirect(buildApplicationUrl(`/?error=${encodeURIComponent(error)}`, request.url));
  response.cookies.delete(STATE_COOKIE);
  return response;
}

function revokeIssuedToken(token: SpoonToken) {
  return Promise.allSettled([
    revokeToken(token.access_token),
    revokeToken(token.refresh_token),
  ]);
}

// Only the newly issued, incomplete token is discarded. An existing login (and
// the DJ's other devices sharing its token) keeps working; a failed re-consent
// should not sign anyone out.
async function rejectMissingScopes(request: NextRequest, token: SpoonToken) {
  await revokeIssuedToken(token);
  return redirectWithError(request, "all_scopes_required");
}

// Identifies the DJ right after login when the app has the me.read scope, so a
// new browser or device reaches the DJ's saved data without waiting for a chat.
async function identifyDj(token: SpoonToken) {
  if (!hasScope(token.scope, "me.read")) return null;
  try {
    return await getMyUserId(token.access_token);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const state = query.get("state");

  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  if (!expectedState) {
    // No login was started from this address in the last 10 minutes: it began
    // elsewhere (e.g. localhost while Spoon returns to the registered address)
    // or took too long.
    return redirectWithError(request, "state_missing");
  }
  if (!statesMatch(expectedState, state)) {
    return redirectWithError(request, "state_mismatch");
  }

  const oauthError = query.get("error");
  if (oauthError) {
    return redirectWithError(request, oauthError);
  }

  const code = query.get("code");
  if (!code) {
    return redirectWithError(request, "missing_code");
  }

  let token: SpoonToken | null = null;
  try {
    const currentSessionId = request.cookies.get(SESSION_COOKIE)?.value;
    if (isSessionBlocked(currentSessionId)) {
      return redirectWithError(request, "account_blocked");
    }

    token = await exchangeCode(code);
    if (getMissingRequiredScopes(token.scope).length > 0) {
      return rejectMissingScopes(request, token);
    }

    const djUserId = await identifyDj(token);
    if (djUserId && isDjBlocked(djUserId)) {
      await revokeIssuedToken(token);
      return redirectWithError(request, "account_blocked");
    }
    const reusableSessionId = currentSessionId
      && !(djUserId && sessionBelongsToOtherDj(getSessionKey(currentSessionId), djUserId))
      ? currentSessionId
      : undefined;
    const sessionId = createAuthSession(reusableSessionId, token);
    if (djUserId) {
      const sessionKey = getSessionKey(sessionId);
      linkDjWorkspaceByKey(sessionKey, djUserId, null);
      // One token set per DJ (Spoon's guidance): the DJ's other devices switch
      // to this login's token and the tokens they held are revoked.
      void Promise.allSettled(adoptTokenForDjSessions(sessionKey).map((refreshToken) => revokeToken(refreshToken)));
    }

    const applicationUrl = buildApplicationUrl("/?status=connected", request.url);
    const response = NextResponse.redirect(applicationUrl);

    response.cookies.delete(STATE_COOKIE);
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      // From the configured public URL: behind a TLS-terminating proxy the
      // request itself can look like plain http.
      secure: applicationUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
      priority: "high",
    });

    return response;
  } catch (error) {
    if (token) await revokeIssuedToken(token);
    const type = error instanceof SessionConfigurationError
      || (error instanceof Error && error.message.includes("required"))
      ? "server_configuration"
      : "token_exchange_failed";
    return redirectWithError(request, type);
  }
}
