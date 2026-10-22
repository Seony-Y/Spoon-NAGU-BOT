import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { announceTeamBattleStatus, finishTeamBattle, startTeamBattle } from "@/lib/live-actions";
import { SESSION_COOKIE } from "@/lib/session";
import {
  getSessionKey,
  saveTeamBattleSettings,
  TEAM_BATTLE_METRICS,
  type TeamBattleMetric,
} from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "game");
  target.searchParams.set("game", "team");
  target.searchParams.set("team", status);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, "authentication_required");
  const sessionKey = getSessionKey(sessionId);

  const formData = await request.formData().catch(() => new FormData());
  const action = String(formData.get("action") ?? "");

  if (action === "settings" || action === "start") {
    if (formData.has("team")) {
      const metric = String(formData.get("metric") ?? "") as TeamBattleMetric;
      const goal = Number(formData.get("goal") || 0);
      const saved = TEAM_BATTLE_METRICS.includes(metric) && saveTeamBattleSettings(sessionId, {
        teamNames: formData.getAll("team").map(String),
        metric,
        goal,
      });
      if (!saved) return redirect(request, "invalid_settings");
    }
    if (action === "settings") return redirect(request, "settings_saved");
    return redirect(request, (await startTeamBattle(sessionKey)).status);
  }
  if (action === "status") return redirect(request, (await announceTeamBattleStatus(sessionKey)).status);
  if (action === "finish") return redirect(request, (await finishTeamBattle(sessionKey)).status);
  return redirect(request, "invalid_action");
}
