import { type NextRequest, NextResponse } from "next/server";
import { disconnectAuthSession } from "@/lib/auth";
import { announceInLiveBroadcast, BOT_LEAVING_MESSAGE, suspendBotForAuthentication } from "@/lib/bot-runtime";
import { SESSION_COOKIE, STATE_COOKIE } from "@/lib/session";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  let target = "/?status=disconnected";

  try {
    if (sessionId) {
      // Sent before the token is revoked; only when this device runs the bot.
      await announceInLiveBroadcast(sessionId, BOT_LEAVING_MESSAGE, { ownSessionOnly: true });
      suspendBotForAuthentication(sessionId);
      await disconnectAuthSession(sessionId);
    }
  } catch {
    target = "/?error=disconnect_failed";
  }

  const response = NextResponse.redirect(buildApplicationUrl(target, request.url), 303);
  response.cookies.delete(STATE_COOKIE);
  return response;
}