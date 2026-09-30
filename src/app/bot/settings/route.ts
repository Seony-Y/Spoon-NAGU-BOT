import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { sendChat } from "@/lib/chat";
import { SESSION_COOKIE } from "@/lib/session";
import {
  deleteBotCommand,
  getBotSettings,
  updateBotSettings,
  upsertBotCommand,
} from "@/lib/session-store";

export const runtime = "nodejs";

function redirect(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/?tab=bot&settings=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, "authentication_required");

  const formData = await request.formData();
  const mode = formData.get("mode");

  if (mode === "greeting") {
    const djNickname = String(formData.get("djNickname") ?? "").trim();
    const greetingMessage = String(formData.get("greetingMessage") ?? "").trim();
    if (!djNickname || djNickname.length > 50) return redirect(request, "invalid_nickname");
    if (!greetingMessage || greetingMessage.length > 200) return redirect(request, "invalid_greeting");

    updateBotSettings(sessionId, { ...getBotSettings(sessionId), djNickname, greetingMessage });
    const announcement = greetingMessage
      .replaceAll("{name}", djNickname)
      .replaceAll("{nickname}", "여러분");
    const result = await sendChat(sessionId, announcement);
    return redirect(request, result.kind === "sent" ? "greeting_sent" : `greeting_saved_${result.kind}`);
  }

  if (mode === "automation_toggle") {
    const setting = String(formData.get("setting") ?? "") as keyof Pick<
      ReturnType<typeof getBotSettings>,
      "welcomeEnabled" | "donationEnabled" | "heartEnabled" | "commandsEnabled"
    >;
    if (!["welcomeEnabled", "donationEnabled", "heartEnabled", "commandsEnabled"].includes(setting)) {
      return redirect(request, "invalid_request");
    }
    const current = getBotSettings(sessionId);
    updateBotSettings(sessionId, {
      ...current,
      [setting]: formData.get("enabled") === "true",
    });
    return redirect(request, "automation_toggled");
  }

  if (mode === "upsert_command") {
    const command = String(formData.get("command") ?? "").trim().toLocaleLowerCase("ko-KR");
    const response = String(formData.get("response") ?? "").trim();
    if (!/^![^\s]{1,19}$/.test(command) || !response || response.length > 200) {
      return redirect(request, "invalid_command");
    }
    upsertBotCommand(sessionId, command, response);
    return redirect(request, "command_saved");
  }

  if (mode === "delete_command") {
    const command = String(formData.get("command") ?? "").trim().toLocaleLowerCase("ko-KR");
    if (command) deleteBotCommand(sessionId, command);
    return redirect(request, "command_deleted");
  }

  return redirect(request, "invalid_request");
}