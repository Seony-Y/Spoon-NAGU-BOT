import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import {
  buildApplicationUrl,
  followCurrentDj,
  hasScope,
  SpoonApiErrorResponse,
} from "@/lib/spoon";

export const runtime = "nodejs";

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "bot");
  target.searchParams.set("follow", status);
  return NextResponse.redirect(target, 303);
}

// Spoon requires the bot account to follow the DJ (during a broadcast) before
// the bot can be made a fixed manager. Needs the optional dj.follow scope.
export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, "authentication_required");
  if (!hasScope(session.scope, "dj.follow")) return redirect(request, "missing_scope");

  try {
    await followCurrentDj(session.access_token);
    return redirect(request, "followed");
  } catch (error) {
    if (error instanceof SpoonApiErrorResponse) {
      if (error.status === 404) return redirect(request, "offline");
      if (error.detailCode === "OAPI_MNGR_0211") return redirect(request, "follow_rejected");
      if (error.status === 403) return redirect(request, "missing_scope");
    }
    return redirect(request, "unavailable");
  }
}
