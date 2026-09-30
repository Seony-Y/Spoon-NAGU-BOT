import { type NextRequest, NextResponse } from "next/server";
import { disconnectAuthSession } from "@/lib/auth";
import { stopBot } from "@/lib/bot-runtime";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;

  try {
    if (sessionId) {
      stopBot(sessionId);
      await disconnectAuthSession(sessionId);
    }

    const response = NextResponse.redirect(new URL("/?status=disconnected", request.url), 303);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?error=disconnect_failed", request.url), 303);
  }
}