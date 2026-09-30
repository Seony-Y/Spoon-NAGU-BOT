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

function redirect(request: NextRequest, status: string, automation?: string) {
  const target = new URL("/", request.url);
  target.searchParams.set("tab", "bot");
  target.searchParams.set("settings", status);
  if (automation) target.searchParams.set("automation", automation);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, "authentication_required");

  const formData = await request.formData();
  const mode = formData.get("mode");

  if (mode === "greeting") {
    const greetingMessage = String(formData.get("greetingMessage") ?? "").trim();
    if (!greetingMessage || greetingMessage.length > 200) return redirect(request, "invalid_greeting");

    const settings = getBotSettings(sessionId);
    if (!settings.djNickname) return redirect(request, "invalid_nickname");
    updateBotSettings(sessionId, { ...settings, greetingMessage });
    const announcement = greetingMessage
      .replaceAll("{name}", settings.djNickname)
      .replaceAll("{nickname}", "여러분");
    const result = await sendChat(sessionId, announcement);
    return redirect(request, result.kind === "sent" ? "greeting_sent" : `greeting_saved_${result.kind}`);
  }

  if (mode === "automation_feature") {
    const feature = String(formData.get("feature") ?? "");
    if (!["welcome", "donation", "heart", "hourly", "commands"].includes(feature)) {
      return redirect(request, "invalid_request");
    }

    const current = getBotSettings(sessionId);
    const enabled = formData.get("enabled") === "on";
    const message = String(formData.get("message") ?? "").trim();
    if (feature !== "commands" && (!message || message.length > 200)) {
      return redirect(request, "invalid_message", feature);
    }

    if (feature === "welcome") {
      updateBotSettings(sessionId, { ...current, welcomeEnabled: enabled, greetingMessage: message });
    } else if (feature === "donation") {
      updateBotSettings(sessionId, { ...current, donationEnabled: enabled, donationMessage: message });
    } else if (feature === "heart") {
      updateBotSettings(sessionId, { ...current, heartEnabled: enabled, heartMessage: message });
    } else if (feature === "hourly") {
      updateBotSettings(sessionId, { ...current, hourlyEnabled: enabled, hourlyMessage: message });
    } else {
      updateBotSettings(sessionId, { ...current, commandsEnabled: enabled });
    }

    return redirect(request, "feature_saved", feature);
  }

  if (mode === "upsert_command") {
    const command = String(formData.get("command") ?? "").trim().toLocaleLowerCase("ko-KR");
    const response = String(formData.get("response") ?? "").trim();
    if (!/^![^\s]{1,19}$/.test(command) || !response || response.length > 200) {
      return redirect(request, "invalid_command");
    }
    upsertBotCommand(sessionId, command, response);
    return redirect(request, "command_saved", "commands");
  }

  if (mode === "delete_command") {
    const command = String(formData.get("command") ?? "").trim().toLocaleLowerCase("ko-KR");
    if (command) deleteBotCommand(sessionId, command);
    return redirect(request, "command_deleted", "commands");
  }

  return redirect(request, "invalid_request");
}