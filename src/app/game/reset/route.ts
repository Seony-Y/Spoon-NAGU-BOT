import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { RESETTABLE_GAMES, resetGameHistory, type ResettableGame } from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

function redirect(request: NextRequest, game: string, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "game");
  target.searchParams.set("game", game);
  target.searchParams.set("reset", status);
  return NextResponse.redirect(target, 303);
}

// Dashboard sessions belong to the DJ (or their own devices), so any signed-in
// session of the workspace may reset its game records.
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => new FormData());
  const game = String(formData.get("game") ?? "") as ResettableGame;
  const target = RESETTABLE_GAMES.includes(game) ? game : "rps";

  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, target, "authentication_required");
  if (!RESETTABLE_GAMES.includes(game)) return redirect(request, target, "invalid");

  resetGameHistory(sessionId, game);
  return redirect(request, target, "done");
}
