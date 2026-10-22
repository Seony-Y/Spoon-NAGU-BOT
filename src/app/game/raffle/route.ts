import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { MAX_RAFFLE_WINNERS } from "@/lib/dj-command";
import { finishRaffle, startRaffle } from "@/lib/live-actions";
import { SESSION_COOKIE } from "@/lib/session";
import { getSessionKey } from "@/lib/session-store";
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
  const sessionKey = getSessionKey(sessionId);

  const formData = await request.formData().catch(() => new FormData());
  const action = String(formData.get("action") ?? "");
  if (action === "start") {
    const winnerCount = Number(formData.get("winnerCount"));
    if (!Number.isSafeInteger(winnerCount) || winnerCount < 1 || winnerCount > MAX_RAFFLE_WINNERS) {
      return redirect(request, "invalid_winner_count");
    }
    return redirect(request, (await startRaffle(sessionKey, winnerCount)).status);
  }

  if (action === "finish") {
    return redirect(request, (await finishRaffle(sessionKey)).status);
  }

  return redirect(request, "invalid_action");
}
