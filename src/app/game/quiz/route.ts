import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { finishQuiz, startNextQuiz, startQuiz } from "@/lib/live-actions";
import { SESSION_COOKIE } from "@/lib/session";
import {
  addQuizQueueItem,
  deleteQuizQueueItem,
  getSessionKey,
} from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";
import { readFormData } from "@/lib/request-body";

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
  const sessionKey = getSessionKey(sessionId);

  const formData = await readFormData(request);
  const action = String(formData.get("action") ?? "");
  const question = String(formData.get("question") ?? "");
  const answer = String(formData.get("answer") ?? "");

  if (action === "start") {
    return redirect(request, (await startQuiz(sessionKey, question, answer)).status);
  }

  if (action === "start_next") {
    return redirect(request, (await startNextQuiz(sessionKey)).status);
  }

  if (action === "finish") {
    return redirect(request, (await finishQuiz(sessionKey)).status);
  }

  if (action === "queue_add") {
    const result = addQuizQueueItem(sessionId, question, answer);
    return redirect(request, result === "added" ? "queued" : result === "full" ? "queue_full" : "invalid_quiz");
  }

  if (action === "queue_delete") {
    const id = Number(formData.get("id"));
    if (!Number.isSafeInteger(id) || id < 1) return redirect(request, "invalid_action");
    return redirect(request, deleteQuizQueueItem(sessionId, id) ? "queue_deleted" : "invalid_action");
  }

  return redirect(request, "invalid_action");
}
