import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { finishSecretWord, revealSecretWordHint, startSecretWord } from "@/lib/live-actions";
import { SESSION_COOKIE } from "@/lib/session";
import { addSecretWord, deleteSecretWord, getSessionKey } from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";
import { readFormData } from "@/lib/request-body";

export const runtime = "nodejs";

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "game");
  target.searchParams.set("game", "secret");
  target.searchParams.set("secret", status);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, "authentication_required");
  const sessionKey = getSessionKey(sessionId);

  const formData = await readFormData(request);
  const action = String(formData.get("action") ?? "");

  if (action === "queue_add") {
    const result = addSecretWord(sessionId, String(formData.get("word") ?? ""), String(formData.get("hint") ?? ""));
    return redirect(request, result === "added" ? "queued" : result === "full" ? "queue_full" : "invalid_word");
  }
  if (action === "queue_delete") {
    const id = Number(formData.get("id"));
    if (!Number.isSafeInteger(id) || id < 1) return redirect(request, "invalid_action");
    return redirect(request, deleteSecretWord(sessionId, id) ? "queue_deleted" : "invalid_action");
  }
  if (action === "start") return redirect(request, (await startSecretWord(sessionKey)).status);
  if (action === "hint") return redirect(request, (await revealSecretWordHint(sessionKey)).status);
  if (action === "finish") return redirect(request, (await finishSecretWord(sessionKey)).status);
  return redirect(request, "invalid_action");
}
