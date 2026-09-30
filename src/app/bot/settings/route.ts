import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { sendChat } from "@/lib/chat";
import { SESSION_COOKIE } from "@/lib/session";
import {
  deleteBotCounter,
  deleteBotCommand,
  getBotSettings,
  resetBotCounter,
  saveBotCounter,
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
    if (!["welcome", "donation", "heart", "repeat", "commands"].includes(feature)) {
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
    } else if (feature === "repeat") {
      const intervalMinutes = Number(formData.get("intervalMinutes"));
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
        return redirect(request, "invalid_interval", feature);
      }
      updateBotSettings(sessionId, {
        ...current,
        repeatEnabled: enabled,
        repeatMessage: message,
        repeatIntervalMinutes: intervalMinutes,
      });
    } else {
      updateBotSettings(sessionId, { ...current, commandsEnabled: enabled });
    }

    return redirect(request, "feature_saved", feature);
  }

  if (mode === "save_counter") {
    const rawId = String(formData.get("id") ?? "");
    const id = rawId ? Number(rawId) : null;
    const name = String(formData.get("name") ?? "").trim();
    const initialValue = Number(formData.get("initialValue"));
    const value = id === null ? initialValue : Number(formData.get("value"));
    if (
      (id !== null && (!Number.isInteger(id) || id < 1))
      || !/^[^\s!]{1,20}$/u.test(name)
      || !Number.isInteger(initialValue)
      || initialValue < 0
      || initialValue > 1_000_000
      || !Number.isInteger(value)
      || value < 0
      || value > 1_000_000
    ) {
      return redirect(request, "invalid_counter", "counters");
    }
    const saved = saveBotCounter(sessionId, id, name, initialValue, value);
    return redirect(request, saved ? "counter_saved" : "counter_conflict", "counters");
  }

  if (mode === "reset_counter" || mode === "delete_counter") {
    const id = Number(formData.get("id"));
    if (!Number.isInteger(id) || id < 1) return redirect(request, "invalid_counter", "counters");
    const changed = mode === "reset_counter"
      ? resetBotCounter(sessionId, id)
      : deleteBotCounter(sessionId, id);
    return redirect(
      request,
      changed ? (mode === "reset_counter" ? "counter_reset" : "counter_deleted") : "invalid_counter",
      "counters",
    );
  }

  if (mode === "upsert_command") {
    const command = String(formData.get("command") ?? "").trim().toLocaleLowerCase("ko-KR");
    const response = String(formData.get("response") ?? "").trim();
    if (command === "!실드") return redirect(request, "reserved_command", "commands");
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