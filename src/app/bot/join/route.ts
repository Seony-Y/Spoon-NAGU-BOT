import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { startBot } from "@/lib/bot-runtime";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);

  if (!sessionId || !session) {
    return NextResponse.redirect(new URL("/?error=authentication_required", request.url), 303);
  }

  const hasEventScope = session.scope
    .split(" ")
    .some((scope) => scope.startsWith("events."));
  if (!hasEventScope) {
    return NextResponse.redirect(new URL("/?error=events_scope_required", request.url), 303);
  }

  if (!startBot(sessionId)) {
    return NextResponse.redirect(new URL("/?error=bot_start_failed", request.url), 303);
  }

  return NextResponse.redirect(new URL("/?bot=started", request.url), 303);
}