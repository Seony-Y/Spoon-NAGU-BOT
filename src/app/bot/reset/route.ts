import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureBotRunning } from "@/lib/bot-runtime";
import { SESSION_COOKIE } from "@/lib/session";
import { getCurrentLiveIdByKey, getSessionKey, recordBroadcastByKey, resetWorkspaceData } from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

// Typed by the DJ in the reset form, on top of the confirm dialog.
const RESET_CONFIRM_WORD = "초기화";

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "backup");
  target.searchParams.set("settings", status);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId || !(await getAuthSession(sessionId))) return redirect(request, "authentication_required");

  const formData = await request.formData().catch(() => new FormData());
  if (String(formData.get("confirm") ?? "").trim() !== RESET_CONFIRM_WORD) return redirect(request, "data_reset_unconfirmed");
  if (!resetWorkspaceData(sessionId)) return redirect(request, "data_reset_failed");

  // Keep the broadcast in progress counted for attendance streaks.
  const sessionKey = getSessionKey(sessionId);
  const liveId = getCurrentLiveIdByKey(sessionKey);
  if (liveId !== undefined) recordBroadcastByKey(sessionKey, liveId);
  ensureBotRunning(sessionId);
  return redirect(request, "data_reset");
}
