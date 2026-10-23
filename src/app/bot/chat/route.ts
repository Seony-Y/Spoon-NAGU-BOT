import { type NextRequest, NextResponse } from "next/server";
import { handleDashboardDjChat } from "@/lib/bot-runtime";
import { sendChat } from "@/lib/chat";
import { SESSION_COOKIE } from "@/lib/session";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.redirect(buildApplicationUrl("/?tab=bot&error=authentication_required", request.url), 303);
  }

  const formData = await request.formData().catch(() => new FormData());
  const message = formData.get("message");
  const chatMessage = typeof message === "string" ? message : "";
  const result = await sendChat(sessionId, chatMessage);
  if (result.kind === "sent") handleDashboardDjChat(sessionId, chatMessage);
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "bot");
  target.searchParams.set("chat", result.kind);
  if (result.kind === "sent") target.searchParams.set("chatMessage", chatMessage.trim());
  return NextResponse.redirect(target, 303);
}