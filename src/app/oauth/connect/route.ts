import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { STATE_COOKIE } from "@/lib/session";
import { buildAuthorizationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

export function GET(request: Request) {
  try {
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(buildAuthorizationUrl(state));

    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/oauth",
      maxAge: 10 * 60,
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/?error=server_configuration", request.url));
  }
}