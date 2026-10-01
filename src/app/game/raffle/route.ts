import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { sendChat } from "@/lib/chat";
import { formatRaffleResultMessages } from "@/lib/raffle";
import { SESSION_COOKIE } from "@/lib/session";
import {
  finishRaffleRound,
  isBotEnabled,
  startRaffleRound,
} from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "game");
  target.searchParams.set("game", "raffle");
  target.searchParams.set("raffle", status);
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
    const winnerCount = Number(formData.get("winnerCount"));
    if (!Number.isSafeInteger(winnerCount) || winnerCount < 1) {
      return redirect(request, "invalid_winner_count");
    }
    if (!startRaffleRound(sessionId, winnerCount)) return redirect(request, "already_active");
    await sendChat(sessionId, `추첨을 시작합니다! !참여를 입력해 주세요. 계정당 한 번 참여할 수 있으며 당첨 인원은 ${winnerCount.toLocaleString("ko-KR")}명입니다.`);
    return redirect(request, "started");
  }

  if (action === "finish") {
    const round = finishRaffleRound(sessionId);
    if (!round) return redirect(request, "not_active");
    const winners = round.entries.filter((entry) => entry.winner);
    await sendChat(sessionId, `추첨 종료! 참여 ${round.entries.length.toLocaleString("ko-KR")}명 · 당첨 ${winners.length.toLocaleString("ko-KR")}명`);
    for (const message of formatRaffleResultMessages(winners)) await sendChat(sessionId, message);
    return redirect(request, "finished");
  }

  return redirect(request, "invalid_action");
}