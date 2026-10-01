import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { normalizeDjNickname } from "@/lib/bot-automation";
import { ensureBotRunning } from "@/lib/bot-runtime";
import { sendChat } from "@/lib/chat";
import { SESSION_COOKIE } from "@/lib/session";
import {
  AUDIENCE_RANKING_COMMANDS,
  clearSongRequests,
  deleteBotCounter,
  deleteBotCommand,
  deleteSongRequest,
  getBotSettings,
  saveBotCounter,
  updateBotSettings,
  updateBotCommand,
  upsertBotCommand,
} from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

const RESERVED_COMMANDS = [
  "!실드",
  "!명령어",
  "!안녕",
  "!신청곡",
  "!가위바위보",
  "!참여",
  "!정답",
  ...AUDIENCE_RANKING_COMMANDS,
];

function isReservedCommand(command: string) {
  return RESERVED_COMMANDS.includes(command);
}

function redirect(request: NextRequest, status: string, automation?: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "bot");
  target.searchParams.set("settings", status);
  if (automation) target.searchParams.set("automation", automation);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const mode = formData.get("mode");
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) {
    return mode === "automation_toggle"
      ? NextResponse.json({ error: "authentication_required" }, { status: 401 })
      : redirect(request, "authentication_required");
  }

  if (mode === "automation_toggle") {
    const feature = String(formData.get("feature") ?? "");
    const enabledValue = String(formData.get("enabled") ?? "");
    if (!["welcome", "donation", "heart", "repeat"].includes(feature)
      || !["true", "false"].includes(enabledValue)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const enabled = enabledValue === "true";
    const current = getBotSettings(sessionId);
    if (feature === "welcome") updateBotSettings(sessionId, { ...current, welcomeEnabled: enabled });
    if (feature === "donation") updateBotSettings(sessionId, { ...current, donationEnabled: enabled });
    if (feature === "heart") updateBotSettings(sessionId, { ...current, heartEnabled: enabled });
    if (feature === "repeat") updateBotSettings(sessionId, { ...current, repeatEnabled: enabled });
    ensureBotRunning(sessionId);
    return NextResponse.json({ enabled });
  }

  if (mode === "dj_nickname") {
    const djNickname = normalizeDjNickname(String(formData.get("djNickname") ?? ""));
    const automation = String(formData.get("automation") ?? "ranking");
    if (djNickname.length > 50) return redirect(request, "invalid_nickname", automation);

    const settings = getBotSettings(sessionId);
    updateBotSettings(sessionId, { ...settings, djNickname });
    return redirect(request, "nickname_saved", automation);
  }

  if (mode === "greeting") {
    const greetingMessage = String(formData.get("greetingMessage") ?? "").trim();
    if (!greetingMessage || greetingMessage.length > 200) return redirect(request, "invalid_greeting");

    const settings = getBotSettings(sessionId);
    updateBotSettings(sessionId, { ...settings, greetingMessage });
    const announcement = greetingMessage
      .replaceAll("{name}", normalizeDjNickname(settings.djNickname) || "DJ")
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
    const enabled = formData.has("enabled")
      ? formData.get("enabled") === "on"
      : feature === "welcome"
        ? current.welcomeEnabled
        : feature === "donation"
          ? current.donationEnabled
          : feature === "heart"
            ? current.heartEnabled
            : feature === "repeat"
              ? current.repeatEnabled
              : true;
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

    ensureBotRunning(sessionId);
    return redirect(request, "feature_saved", feature);
  }

  if (mode === "save_counter") {
    const rawId = String(formData.get("id") ?? "");
    const id = rawId ? Number(rawId) : null;
    const name = String(formData.get("name") ?? "").trim();
    const value = Number(formData.get("value"));
    if (
      (id !== null && (!Number.isInteger(id) || id < 1))
      || !/^[^\s!]{1,20}$/u.test(name)
      || !Number.isInteger(value)
      || value < 0
      || value > 1_000_000
    ) {
      return redirect(request, "invalid_counter", "counters");
    }
    const saved = saveBotCounter(sessionId, id, name, value);
    return redirect(request, saved ? "counter_saved" : "counter_conflict", "counters");
  }

  if (mode === "delete_counter") {
    const id = Number(formData.get("id"));
    if (!Number.isInteger(id) || id < 1) return redirect(request, "invalid_counter", "counters");
    const changed = deleteBotCounter(sessionId, id);
    return redirect(
      request,
      changed ? "counter_deleted" : "invalid_counter",
      "counters",
    );
  }

  if (mode === "upsert_command" || mode === "update_command") {
    const command = String(formData.get("command") ?? "").trim().toLocaleLowerCase("ko-KR");
    const response = String(formData.get("response") ?? "").trim();
    if (isReservedCommand(command)) {
      return redirect(request, "reserved_command", "commands");
    }
    if (!/^![^\s]{1,19}$/.test(command) || !response || response.length > 200) {
      return redirect(request, "invalid_command");
    }
    if (mode === "update_command") {
      const originalCommand = String(formData.get("originalCommand") ?? "").trim().toLocaleLowerCase("ko-KR");
      if (isReservedCommand(originalCommand)) return redirect(request, "reserved_command", "commands");
      if (!/^![^\s]{1,19}$/.test(originalCommand)) return redirect(request, "invalid_command", "commands");
      const updated = updateBotCommand(sessionId, originalCommand, command, response);
      return redirect(request, updated ? "command_updated" : "command_conflict", "commands");
    }
    upsertBotCommand(sessionId, command, response);
    return redirect(request, "command_saved", "commands");
  }

  if (mode === "delete_command") {
    const command = String(formData.get("command") ?? "").trim().toLocaleLowerCase("ko-KR");
    if (isReservedCommand(command)) return redirect(request, "reserved_command", "commands");
    if (command) deleteBotCommand(sessionId, command);
    return redirect(request, "command_deleted", "commands");
  }

  if (mode === "delete_song_request") {
    const id = Number(formData.get("id"));
    if (!Number.isSafeInteger(id) || id < 1) return redirect(request, "invalid_request", "requests");
    const deleted = deleteSongRequest(sessionId, id);
    return redirect(request, deleted ? "song_request_deleted" : "invalid_request", "requests");
  }

  if (mode === "clear_song_requests") {
    clearSongRequests(sessionId);
    return redirect(request, "song_requests_cleared", "requests");
  }

  return redirect(request, "invalid_request");
}