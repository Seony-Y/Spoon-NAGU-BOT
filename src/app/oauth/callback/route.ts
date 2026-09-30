import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createAuthSession } from "@/lib/auth";
import { SESSION_COOKIE, STATE_COOKIE } from "@/lib/session";
import { isSessionBlocked } from "@/lib/session-store";
import { exchangeCode } from "@/lib/spoon";

export const runtime = "nodejs";

function statesMatch(expected: string | undefined, received: string | null) {
  if (!expected || !received) return false;

  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);

  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes);
}

function redirectWithError(request: NextRequest, error: string) {
  const response = NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
  response.cookies.delete(STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  if (isSessionBlocked(request.cookies.get(SESSION_COOKIE)?.value)) {
    return redirectWithError(request, "account_blocked");
  }
  const query = request.nextUrl.searchParams;
  const state = query.get("state");

  if (!statesMatch(request.cookies.get(STATE_COOKIE)?.value, state)) {
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

  try {
    const token = await exchangeCode(code);
    const sessionId = createAuthSession(request.cookies.get(SESSION_COOKIE)?.value, token);
    const response = NextResponse.redirect(new URL("/?status=connected", request.url));

    response.cookies.delete(STATE_COOKIE);
    response.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      priority: "high",
    });

    return response;
  } catch (error) {
    const type = error instanceof Error && error.message.includes("required")
      ? "server_configuration"
      : "token_exchange_failed";
    return redirectWithError(request, type);
  }
}