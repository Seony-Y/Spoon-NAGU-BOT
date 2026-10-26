import { type NextRequest, NextResponse } from "next/server";
import { disconnectAuthSession } from "@/lib/auth";
import { announceInLiveBroadcast, BOT_LEAVING_MESSAGE, suspendBotForAuthentication } from "@/lib/bot-runtime";
import { SESSION_COOKIE, STATE_COOKIE } from "@/lib/session";
import { getSessionKey, isWorkspaceLinkedByKey } from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  let target = "/?status=disconnected";
  // The DJ's data lives in their workspace, found again at the next login, so
  // the cookie can go. Data of a DJ not yet identified is reachable only
  // through this session, so that cookie stays for the next login to merge.
  let dropCookie = false;

  try {
    if (sessionId) {
      dropCookie = isWorkspaceLinkedByKey(getSessionKey(sessionId));
      // Sent before the token is revoked: every device signs out, bot included.
      await announceInLiveBroadcast(sessionId, BOT_LEAVING_MESSAGE);
      suspendBotForAuthentication(sessionId);
      await disconnectAuthSession(sessionId);
    }
  } catch {
    target = "/?error=disconnect_failed";
  }

  const response = NextResponse.redirect(buildApplicationUrl(target, request.url), 303);
  response.cookies.delete(STATE_COOKIE);
  if (dropCookie) response.cookies.delete(SESSION_COOKIE);
  return response;
}