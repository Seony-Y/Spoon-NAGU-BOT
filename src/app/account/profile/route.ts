import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { getBotSettings, updateBotSettings } from "@/lib/session-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) {
    return NextResponse.redirect(new URL("/?error=authentication_required", request.url), 303);
  }

  const formData = await request.formData();
  const djNickname = String(formData.get("djNickname") ?? "").trim();
  if (!djNickname || djNickname.length > 50) {
    return NextResponse.redirect(new URL("/?status=invalid_nickname", request.url), 303);
  }

  updateBotSettings(sessionId, { ...getBotSettings(sessionId), djNickname });
  return NextResponse.redirect(new URL("/?status=nickname_saved", request.url), 303);
}