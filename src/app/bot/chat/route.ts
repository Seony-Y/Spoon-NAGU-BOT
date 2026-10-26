import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { handleDashboardDjChat } from "@/lib/bot-runtime";
import { sendChat } from "@/lib/chat";
import { SESSION_COOKIE } from "@/lib/session";
import { buildApplicationUrl } from "@/lib/spoon";
import { readFormData } from "@/lib/request-body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId || !(await getAuthSession(sessionId))) {
    return NextResponse.redirect(buildApplicationUrl("/?tab=bot&error=authentication_required", request.url), 303);
  }

  const formData = await readFormData(request);
  const message = formData.get("message");
  const chatMessage = typeof message === "string" ? message : "";
  const result = await sendChat(sessionId, chatMessage);
  if (result.kind === "sent") {
    // The message went out; a failure running it as a command must not look
    // like a failed send (the DJ would resend it).
    try {
      handleDashboardDjChat(sessionId, chatMessage);
    } catch (error) {
      console.error("Dashboard command failed", error instanceof Error ? error.message : error);
    }
  }
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "bot");
  target.searchParams.set("chat", result.kind);
  if (result.kind === "sent") target.searchParams.set("chatMessage", chatMessage.trim());
  return NextResponse.redirect(target, 303);
}