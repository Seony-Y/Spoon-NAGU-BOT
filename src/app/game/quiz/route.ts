import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { sendChat } from "@/lib/chat";
import { SESSION_COOKIE } from "@/lib/session";
import {
  finishQuizRound,
  formatQuizResultMessages,
  isBotEnabled,
  startQuizRound,
} from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "game");
  target.searchParams.set("game", "quiz");
  target.searchParams.set("quiz", status);
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
    const question = String(formData.get("question") ?? "").trim();
    const answer = String(formData.get("answer") ?? "").trim();
    if (!question || question.length > 180 || !answer || answer.length > 100) {
      return redirect(request, "invalid_quiz");
    }
    if (!startQuizRound(sessionId, question, answer)) return redirect(request, "already_active");
    await sendChat(sessionId, `[퀴즈] ${question}`);
    await sendChat(sessionId, "!정답 정답내용으로 답을 제출해 주세요. 답은 다시 제출할 수 있습니다.");
    return redirect(request, "started");
  }

  if (action === "finish") {
    const round = finishQuizRound(sessionId);
    if (!round) return redirect(request, "not_active");
    for (const message of formatQuizResultMessages(round)) await sendChat(sessionId, message);
    return redirect(request, "finished");
  }

  return redirect(request, "invalid_action");
}