import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { OAUTH_ACCESS_COOKIE, verifyOAuthAccessProof } from "@/lib/access-code";
import { SESSION_COOKIE, STATE_COOKIE } from "@/lib/session";
import { isSessionBlocked } from "@/lib/session-store";
import { buildApplicationUrl, buildAuthorizationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  if (isSessionBlocked(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.redirect(buildApplicationUrl("/?error=account_blocked", request.url));
  }
  if (!verifyOAuthAccessProof(request.cookies.get(OAUTH_ACCESS_COOKIE)?.value)) {
    const response = NextResponse.redirect(buildApplicationUrl("/?error=access_code_required", request.url));
    response.cookies.delete(OAUTH_ACCESS_COOKIE);
    return response;
  }
  try {
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(buildAuthorizationUrl(state));

    response.cookies.delete(OAUTH_ACCESS_COOKIE);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: buildApplicationUrl("/", request.url).protocol === "https:",
      sameSite: "lax",
      path: "/oauth",
      maxAge: 10 * 60,
    });

    return response;
  } catch {
    return NextResponse.redirect(buildApplicationUrl("/?error=server_configuration", request.url));
  }
}