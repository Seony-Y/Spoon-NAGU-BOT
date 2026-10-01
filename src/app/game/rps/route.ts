import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { sendChat } from "@/lib/chat";
import { SESSION_COOKIE } from "@/lib/session";
import {
  finishRpsRound,
  isBotEnabled,
  startRpsRound,
} from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";
import { formatRpsResultMessages, isRpsChoice } from "@/lib/rock-paper-scissors";

export const runtime = "nodejs";

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "game");
  target.searchParams.set("game", "rps");
  target.searchParams.set("rps", status);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, "authentication_required");

  const formData = await request.formData();
  const action = String(formData.get("action") ?? "");
  if (action === "start") {
    if (!isBotEnabled(sessionId)) return redirect(request, "bot_required");
    const scopes = session.scope.split(" ");
    if (!scopes.includes("events.chat") || !scopes.includes("chat.send")) {
      return redirect(request, "missing_scope");
    }
    const choice = String(formData.get("choice") ?? "");
    if (!isRpsChoice(choice)) return redirect(request, "invalid_choice");
    if (!startRpsRound(sessionId, choice)) return redirect(request, "already_active");
    await sendChat(sessionId, "가위바위보가 시작됐습니다! !가위바위보 가위|바위|보로 참여해 주세요. 계정당 한 번만 참여할 수 있습니다.");
    return redirect(request, "started");
  }

  if (action === "finish") {
    const round = finishRpsRound(sessionId);
    if (!round) return redirect(request, "not_active");
    await sendChat(sessionId, ` 종료! DJ의 선택은 ${round.djChoice}입니다.`);
    for (const message of formatRpsResultMessages(round.entries)) await sendChat(sessionId, message);
    return redirect(request, "finished");
  }

  return redirect(request, "invalid_action");
}