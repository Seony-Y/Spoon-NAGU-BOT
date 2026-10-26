import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { finishRps, startRps } from "@/lib/live-actions";
import { SESSION_COOKIE } from "@/lib/session";
import { getSessionKey } from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";
import { isRpsChoice } from "@/lib/rock-paper-scissors";
import { readFormData } from "@/lib/request-body";

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
  const sessionKey = getSessionKey(sessionId);

  const formData = await readFormData(request);
  const action = String(formData.get("action") ?? "");
  if (action === "start") {
    const choice = String(formData.get("choice") ?? "random");
    if (choice !== "random" && !isRpsChoice(choice)) return redirect(request, "invalid_choice");
    const result = await startRps(sessionKey, choice === "random" ? undefined : choice);
    return redirect(request, result.status);
  }

  if (action === "finish") {
    return redirect(request, (await finishRps(sessionKey)).status);
  }

  return redirect(request, "invalid_action");
}
