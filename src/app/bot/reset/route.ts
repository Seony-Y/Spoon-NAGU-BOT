import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { announceInLiveBroadcast, ensureBotRunning, settleBotAfterDataChange } from "@/lib/bot-runtime";
import { SESSION_COOKIE } from "@/lib/session";
import { resetWorkspaceData } from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";
import { readFormData } from "@/lib/request-body";

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

  const formData = await readFormData(request);
  if (String(formData.get("confirm") ?? "").trim() !== RESET_CONFIRM_WORD) return redirect(request, "data_reset_unconfirmed");
  if (!resetWorkspaceData(sessionId)) return redirect(request, "data_reset_failed");
  settleBotAfterDataChange(sessionId);
  ensureBotRunning(sessionId);
  await announceInLiveBroadcast(sessionId, "[NAGU BOT] DJ가 봇 데이터를 초기화했어요. 진행 중이던 게임과 기록이 모두 지워졌어요.");
  return redirect(request, "data_reset");
}
