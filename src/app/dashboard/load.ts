import { cookies } from "next/headers";
import { loadAudienceStatus } from "@/lib/audience";
import { getAuthSession } from "@/lib/auth";
import { ensureBotRunning, getBotSnapshot } from "@/lib/bot-runtime";
import { loadLiveStatus } from "@/lib/live";
import { SESSION_COOKIE } from "@/lib/session";
import {
  getBotSettings,
  getRouletteSettings,
  getSessionKey,
  isWorkspaceLinkedByKey,
  isSessionBlocked,
  listBotCommands,
  listBotCounters,
  listQuizQueue,
  listSecretWordQueue,
  listSecretWordRounds,
  listQuizRounds,
  listRaffleRounds,
  listSongRequests,
  listRpsRounds,
  listRouletteItems,
  listRouletteKeeps,
  listRouletteResults,
} from "@/lib/session-store";
import { getMissingRequiredScopes } from "@/lib/spoon";
import { groupRouletteKeeps, normalizeRoulettePercentages } from "./format";
import {
  errorMessages,
  scopeLabels,
  PREVIEW_FUTURE_TIMESTAMP,
  PREVIEW_EVENT_TIMESTAMP,
  chatNotices,
  settingsNotices,
  automationTabs,
} from "./labels";

export type DashboardSearchParams = {
  status?: string;
  error?: string;
  bot?: string;
  chat?: string;
  chatMessage?: string;
  settings?: string;
  tab?: string;
  automation?: string;
  game?: string;
  rps?: string;
  follow?: string;
  raffle?: string;
  quiz?: string;
  secret?: string;
  roulette?: string;
  rouletteEdit?: string;
  preview?: string;
};

// Everything the dashboard renders, loaded once per request. Tab components
// receive it as `view` and pick what they need.
export async function loadDashboardView(params: DashboardSearchParams) {
  const previewConnected = process.env.NODE_ENV === "development" && params.preview === "connected";
  const isBotTab = params.tab === "bot";
  const isGameTab = params.tab === "game";
  const isBackupTab = params.tab === "backup";
  const isDashboardTab = !isBotTab && !isGameTab && !isBackupTab;
  const gameTab = params.game === "roulette"
    ? "roulette"
    : params.game === "secret"
      ? "secret"
    : params.game === "quiz"
      ? "quiz"
    : params.game === "raffle"
      ? "raffle"
      : "rps";
  const automationTab = automationTabs.some(([key]) => key === params.automation)
    ? params.automation
    : "welcome";
  const cookieStore = await cookies();
  const sessionId = previewConnected ? "development-preview" : cookieStore.get(SESSION_COOKIE)?.value;
  const connectionBlocked = previewConnected ? false : isSessionBlocked(sessionId);
  let session = previewConnected ? {
    access_token: "preview",
    token_type: "Bearer" as const,
    expires_in: 3600,
    refresh_token: "preview",
    scope: Object.keys(scopeLabels).join(" "),
    expires_at: PREVIEW_FUTURE_TIMESTAMP,
  } : await getAuthSession(sessionId);
  const liveResult = previewConnected ? {
    session,
    status: {
      kind: "live" as const,
      live: {
        liveId: 1,
        title: "NAGU BOT 개발 화면",
        startedAt: new Date().toISOString(),
        closeAirTime: "",
        listenerCount: 24,
        totalListenerCount: 138,
        welcomeMessage: "어서 오세요. 오늘도 편안하게 함께해요!",
        isChatFrozen: false,
        categories: ["소통"],
        tags: ["나구봇", "개발미리보기"],
      },
    },
    authenticationExpired: false,
  } : isDashboardTab
    ? await loadLiveStatus(sessionId, session)
    // Other tabs do not show live info; skipping the Spoon calls keeps their
    // frequent auto-refresh cheap and well under the shared rate limit.
    : { session, status: null, authenticationExpired: false };
  session = liveResult.session;
  const audienceResult = previewConnected ? {
    session,
    listeners: { kind: "ready" as const, items: [
      { id: "preview-listener-1", nickname: "첫번째 청취자" },
      { id: "preview-listener-2", nickname: "나구 친구" },
      { id: "preview-listener-3", nickname: "오늘의 게스트" },
    ] },
    fans: { kind: "ready" as const, items: [
      { id: "preview-fan-1", nickname: "스푼 요정", rank: 1, spoonCount: 1250 },
      { id: "preview-fan-2", nickname: "단골 청취자", rank: 2, spoonCount: 840 },
      { id: "preview-fan-3", nickname: "응원단장", rank: 3, spoonCount: 520 },
    ] },
    authenticationExpired: false,
  } : isDashboardTab
    ? await loadAudienceStatus(sessionId, session)
    : { session, listeners: { kind: "missing_scope" as const }, fans: { kind: "missing_scope" as const }, authenticationExpired: false };
  session = audienceResult.session;
  const connected = session !== null;
  const error = params.error
    ? errorMessages[params.error] ?? "연동에 실패했습니다."
    : liveResult.authenticationExpired || audienceResult.authenticationExpired
      ? "인증이 만료되었습니다. Spoon 계정을 다시 연결해 주세요."
      : null;
  const connectionError = connectionBlocked ? errorMessages.account_blocked : error;
  const scopes = session?.scope.split(" ").filter(Boolean) ?? [];
  const missingRequiredScopes = session ? getMissingRequiredScopes(session.scope) : [];
  const allScopesRequired = params.error === "all_scopes_required";
  const disconnected = params.status === "disconnected";
  const liveStatus = liveResult.status;
  if (connected && sessionId && !previewConnected) ensureBotRunning(sessionId);
  const bot = connected && sessionId ? getBotSnapshot(sessionId) : null;
  const hasEventScope = scopes.some((scope) => scope.startsWith("events."));
  const hasChatScope = scopes.includes("chat.send");
  const workspaceLinked = previewConnected || !connected || !sessionId
    ? true
    : isWorkspaceLinkedByKey(getSessionKey(sessionId));
  const chatNotice = params.chat ? chatNotices[params.chat] : null;
  const settingsNotice = params.settings
    ? settingsNotices[params.settings] ?? (params.settings.startsWith("greeting_saved_")
      ? { tone: "error" as const, text: "인사말은 저장했지만 현재 방송 채팅에는 보내지 못했습니다." }
      : null)
    : null;
  const accountSettings = connected && sessionId ? getBotSettings(sessionId) : null;
  const botSettings = isBotTab ? accountSettings : null;
  const botCommands = isBotTab && connected && sessionId ? listBotCommands(sessionId) : [];
  const botCounters = isBotTab && connected && sessionId ? listBotCounters(sessionId) : [];
  const songRequests = isBotTab && connected && sessionId ? listSongRequests(sessionId) : [];
  const rpsRounds = isGameTab && connected && sessionId && !previewConnected
    ? listRpsRounds(sessionId)
    : [];
  const rpsRound = rpsRounds.find((round) => round.active) ?? rpsRounds[0] ?? null;
  const rpsHistory = rpsRounds.filter((round) => !round.active);
  const raffleRounds = isGameTab && gameTab === "raffle" && connected && sessionId && !previewConnected
    ? listRaffleRounds(sessionId)
    : [];
  const raffleRound = raffleRounds.find((round) => round.active) ?? raffleRounds[0] ?? null;
  const raffleHistory = raffleRounds.filter((round) => !round.active);
  const previewQuizStartedAt = PREVIEW_FUTURE_TIMESTAMP - 30_000;
  const quizRounds = isGameTab && gameTab === "quiz" && connected && sessionId
    ? previewConnected
      ? [{
          roundId: 3,
          active: false,
          question: "대한민국의 수도는 어디일까요?",
          answer: "서울",
          startedAt: previewQuizStartedAt,
          endedAt: previewQuizStartedAt + 15_000,
          winnerUserId: "preview-quiz-1",
          winnerNickname: "첫번째 청취자",
          elapsedMs: 3_500,
          submissions: [
            { userId: "preview-quiz-1", nickname: "첫번째 청취자", answer: "서울", submittedAt: previewQuizStartedAt + 3_500, correct: true, correctAt: previewQuizStartedAt + 3_500 },
            { userId: "preview-quiz-2", nickname: "나구 친구", answer: "서울", submittedAt: previewQuizStartedAt + 3_501, correct: true, correctAt: previewQuizStartedAt + 3_500 },
            { userId: "preview-quiz-3", nickname: "오늘의 게스트", answer: "서울", submittedAt: previewQuizStartedAt + 8_200, correct: true, correctAt: previewQuizStartedAt + 8_200 },
            { userId: "preview-quiz-4", nickname: "퀴즈 도전자", answer: "부산", submittedAt: previewQuizStartedAt + 10_100, correct: false, correctAt: null },
          ],
        }]
      : listQuizRounds(sessionId)
    : [];
  const quizRound = quizRounds.find((round) => round.active) ?? quizRounds[0] ?? null;
  const quizHistory = quizRounds.filter((round) => !round.active);
  const quizQueue = isGameTab && gameTab === "quiz" && connected && sessionId && !previewConnected
    ? listQuizQueue(sessionId)
    : [];
  const isSecretPage = isGameTab && gameTab === "secret" && connected && sessionId && !previewConnected;
  const secretWordQueue = isSecretPage ? listSecretWordQueue(sessionId) : [];
  const secretWordRounds = isSecretPage ? listSecretWordRounds(sessionId) : [];
  const secretWordRound = secretWordRounds.find((round) => round.active) ?? null;
  const secretWordHistory = secretWordRounds.filter((round) => !round.active);
  const isRoulettePage = isGameTab && gameTab === "roulette" && connected && sessionId;
  const rouletteSettings = isRoulettePage
    ? previewConnected
      ? { enabled: false, cost: 20, missWeight: 2 }
      : getRouletteSettings(sessionId)
    : null;
  const rouletteItems = isRoulettePage
    ? previewConnected
      ? [
          { id: 1, label: "커피 쿠폰", weight: 5 },
          { id: 2, label: "노래 신청권", weight: 3 },
          { id: 3, label: "DJ 애칭권", weight: 1 },
        ]
      : listRouletteItems(sessionId)
    : [];
  const rouletteResults = isRoulettePage
    ? previewConnected
      ? [
          { id: 3, userId: "fan-1", nickname: "단골 청취자", itemLabel: "커피 쿠폰", isMiss: false, spoons: 20, createdAt: PREVIEW_EVENT_TIMESTAMP - 60_000 },
          { id: 2, userId: "fan-2", nickname: "응원단장", itemLabel: null, isMiss: true, spoons: 20, createdAt: PREVIEW_EVENT_TIMESTAMP - 180_000 },
          { id: 1, userId: "fan-1", nickname: "단골 청취자", itemLabel: "커피 쿠폰", isMiss: false, spoons: 20, createdAt: PREVIEW_EVENT_TIMESTAMP - 300_000 },
        ]
      : listRouletteResults(sessionId)
    : [];
  const rouletteKeeps = isRoulettePage
    ? previewConnected
      ? [
          { userId: "fan-1", nickname: "단골 청취자", itemLabel: "커피 쿠폰", count: 2, updatedAt: PREVIEW_EVENT_TIMESTAMP },
          { userId: "fan-1", nickname: "단골 청취자", itemLabel: "노래 신청권", count: 1, updatedAt: PREVIEW_EVENT_TIMESTAMP },
          { userId: "fan-2", nickname: "응원단장", itemLabel: "DJ 애칭권", count: 1, updatedAt: PREVIEW_EVENT_TIMESTAMP },
        ]
      : listRouletteKeeps(sessionId)
    : [];
  const rouletteKeepUsers = groupRouletteKeeps(rouletteKeeps);
  const roulettePercentages = normalizeRoulettePercentages(
    rouletteItems,
    rouletteSettings?.missWeight ?? 0,
  );
  return {
    params,
    previewConnected,
    isBotTab,
    isGameTab,
    isBackupTab,
    isDashboardTab,
    gameTab,
    automationTab,
    cookieStore,
    sessionId,
    connectionBlocked,
    session,
    liveResult,
    audienceResult,
    connected,
    error,
    connectionError,
    scopes,
    missingRequiredScopes,
    allScopesRequired,
    disconnected,
    liveStatus,
    bot,
    hasEventScope,
    hasChatScope,
    workspaceLinked,
    chatNotice,
    settingsNotice,
    accountSettings,
    botSettings,
    botCommands,
    botCounters,
    songRequests,
    rpsRounds,
    rpsRound,
    rpsHistory,
    raffleRounds,
    raffleRound,
    raffleHistory,
    previewQuizStartedAt,
    quizRounds,
    quizRound,
    quizHistory,
    quizQueue,
    secretWordQueue,
    secretWordRound,
    secretWordHistory,
    isRoulettePage,
    rouletteSettings,
    rouletteItems,
    rouletteResults,
    rouletteKeeps,
    rouletteKeepUsers,
    roulettePercentages,
  };
}

export type DashboardView = Awaited<ReturnType<typeof loadDashboardView>>;
