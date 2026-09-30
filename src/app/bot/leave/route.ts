import { type NextRequest, NextResponse } from "next/server";
import { stopBot } from "@/lib/bot-runtime";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionId) stopBot(sessionId);
  return NextResponse.redirect(new URL("/?tab=bot&bot=stopped", request.url), 303);
}