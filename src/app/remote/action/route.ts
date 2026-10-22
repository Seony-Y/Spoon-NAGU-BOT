import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { MAX_RAFFLE_WINNERS, type AutomationFeature } from "@/lib/dj-command";
import {
  adjustCounter,
  finishQuiz,
  finishRaffle,
  finishRps,
  setAutomationEnabled,
  setRouletteEnabled,
  announceTeamBattleStatus,
  finishSecretWord,
  finishTeamBattle,
  startTeamBattle,
  revealSecretWordHint,
  startNextQuiz,
  startSecretWord,
  startRaffle,
  startRps,
  type LiveActionResult,
} from "@/lib/live-actions";
import { SESSION_COOKIE } from "@/lib/session";
import { getSessionKey } from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

const AUTOMATION_FEATURES: AutomationFeature[] = ["welcome", "donation", "heart", "repeat", "follow"];

function redirect(request: NextRequest, result: string) {
  const target = buildApplicationUrl("/remote", request.url);
  target.searchParams.set("r", result);
  return NextResponse.redirect(target, 303);
}

function fromResult(game: string, result: LiveActionResult) {
  return `${game}_${result.status}`;
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, "authentication_required");
  const sessionKey = getSessionKey(sessionId);

  const formData = await request.formData().catch(() => new FormData());
  const action = String(formData.get("action") ?? "");

  switch (action) {
    case "rps_start":
      return redirect(request, fromResult("rps", await startRps(sessionKey)));
    case "rps_finish":
      return redirect(request, fromResult("rps", await finishRps(sessionKey)));
    case "raffle_start": {
      const winnerCount = Number(formData.get("winnerCount"));
      if (!Number.isSafeInteger(winnerCount) || winnerCount < 1 || winnerCount > MAX_RAFFLE_WINNERS) {
        return redirect(request, "raffle_invalid_winner_count");
      }
      return redirect(request, fromResult("raffle", await startRaffle(sessionKey, winnerCount)));
    }
    case "raffle_finish":
      return redirect(request, fromResult("raffle", await finishRaffle(sessionKey)));
    case "quiz_start":
      return redirect(request, fromResult("quiz", await startNextQuiz(sessionKey)));
    case "quiz_finish":
      return redirect(request, fromResult("quiz", await finishQuiz(sessionKey)));
    case "secret_start":
      return redirect(request, fromResult("secret", await startSecretWord(sessionKey)));
    case "secret_hint":
      return redirect(request, fromResult("secret", await revealSecretWordHint(sessionKey)));
    case "secret_finish":
      return redirect(request, fromResult("secret", await finishSecretWord(sessionKey)));
    case "team_start":
      return redirect(request, fromResult("team", await startTeamBattle(sessionKey)));
    case "team_status":
      return redirect(request, fromResult("team", await announceTeamBattleStatus(sessionKey)));
    case "team_finish":
      return redirect(request, fromResult("team", await finishTeamBattle(sessionKey)));
    case "counter": {
      const id = Number(formData.get("id"));
      const delta = Number(formData.get("delta"));
      if (!Number.isSafeInteger(id) || ![1, -1].includes(delta)) return redirect(request, "invalid");
      return redirect(request, await adjustCounter(sessionKey, id, delta) ? "counter_saved" : "invalid");
    }
    case "roulette":
      setRouletteEnabled(sessionKey, formData.get("enabled") === "true");
      return redirect(request, "switch_saved");
    case "automation": {
      const feature = String(formData.get("feature") ?? "") as AutomationFeature;
      if (!AUTOMATION_FEATURES.includes(feature)) return redirect(request, "invalid");
      setAutomationEnabled(sessionKey, feature, formData.get("enabled") === "true");
      return redirect(request, "switch_saved");
    }
    default:
      return redirect(request, "invalid");
  }
}
