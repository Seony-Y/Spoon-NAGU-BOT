import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import naguBot from "@/asset/NaGuBot.png";
import { getAuthSession } from "@/lib/auth";
import { loadAudienceStatus } from "@/lib/audience";
import { ensureBotRunning, getBotSnapshot, type BotConnectionState, type BotEvent } from "@/lib/bot-runtime";
import { DJ_COMMAND_HELP, MAX_RAFFLE_WINNERS } from "@/lib/dj-command";
import { loadLiveStatus } from "@/lib/live";
import { SESSION_COOKIE } from "@/lib/session";
import { getMissingRequiredScopes } from "@/lib/spoon";
import {
  getBotSettings,
  getRouletteSettings,
  getSessionKey,
  isWorkspaceLinkedByKey,
  isSessionBlocked,
  listBotCommands,
  listBotCounters,
  listQuizQueue,
  listQuizRounds,
  listRaffleRounds,
  listSongRequests,
  listRpsRounds,
  listRouletteItems,
  listRouletteKeeps,
  listRouletteResults,
  type RouletteKeep,
} from "@/lib/session-store";
import { AutoRefresh, RefreshButton, RefreshLiveButton } from "./refresh-live-button";
import { AutomationToggle } from "./bot/automation-toggle";
import { ClearStatusParams } from "./clear-status-params";
import { ConfirmButton } from "./confirm-button";
import { RouletteDistributionEditor } from "./game/roulette/roulette-distribution-editor";
import { RouletteKeepEditor } from "./game/roulette/roulette-keep-editor";
import { OAuthLoginGate } from "./oauth-login-gate";
import { SiteFooter, SiteHeader } from "./site-chrome";

type HomeProps = {
  searchParams: Promise<{
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
    roulette?: string;
    rouletteEdit?: string;
    preview?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  access_denied: "연동 요청이 취소되었습니다.",
  invalid_scope: "로그인 중 문제가 생겼습니다. 다시 로그인해 주세요.",
  all_scopes_required: "NAGU BOT에 필요한 모든 권한을 승인해야 연결할 수 있습니다.",
  access_code_required: "입장코드를 확인한 뒤 Spoon DJ 계정으로 로그인해 주세요.",
  missing_code: "로그인 중 문제가 생겼습니다. 다시 로그인해 주세요.",
  state_mismatch: "로그인 시간이 지났습니다. 처음부터 다시 로그인해 주세요.",
  token_exchange_failed: "로그인을 완료하지 못했습니다. 다시 로그인해 주시고, 계속되면 운영자에게 문의해 주세요.",
  disconnect_failed: "연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  authentication_required: "인증이 만료되었습니다. Spoon 계정을 다시 연결해 주세요.",
  events_scope_required: "실시간 이벤트 권한을 먼저 승인해 주세요.",
  bot_start_failed: "봇을 입장시키지 못했습니다. 다시 시도해 주세요.",
  account_blocked: "관리자가 이 DJ 연결을 차단했습니다.",
  server_configuration: "서비스 준비 중입니다. 운영자에게 문의해 주세요.",
};

const scopeLabels: Record<string, string> = {
  "live.read": "방송 정보",
  "dj.follow": "DJ 팔로우",
  "events.chat": "실시간 채팅",
  "events.presence": "청취자 입장",
  "events.like": "좋아요",
  "events.donation": "후원 내역",
  "events.follow": "팔로우",
  "me.read": "DJ 식별",
  "donations.read": "후원 기록 조회",
  "chat.send": "봇 채팅",
  "listeners.read": "청취자 목록",
  "fans.read": "팬 랭킹",
};

const PREVIEW_FUTURE_TIMESTAMP = 4_102_444_800_000;
const PREVIEW_EVENT_TIMESTAMP = 1_735_689_600_000;

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

function formatDateTime(value: string | number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

function formatElapsedTime(value: number | null) {
  if (value === null) return "기록 없음";
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}초`;
}

function getFirstCorrectAt(submissions: Array<{ correct: boolean; correctAt: number | null }>) {
  const correctTimes = submissions.flatMap((submission) => (
    submission.correct && submission.correctAt !== null ? [submission.correctAt] : []
  ));
  return correctTimes.length > 0 ? Math.min(...correctTimes) : null;
}

const botStateLabels: Record<BotConnectionState, string> = {
  stopped: "꺼짐",
  starting: "시작 중",
  waiting: "방송 대기",
  connecting: "연결 중",
  connected: "입장 중",
  reconnecting: "재연결 중",
  authentication_required: "재연결 필요",
  permission_required: "권한 필요",
  duplicate_connection: "다른 곳에서 연결됨",
  blocked: "입장 차단",
  error: "연결 오류",
};

const chatNotices: Record<string, { tone: "success" | "error"; title: string; detail: string }> = {
  sent: { tone: "success", title: "채팅 전송 완료", detail: "Spoon 방송 채팅에 메시지를 보냈습니다." },
  invalid_message: { tone: "error", title: "메시지를 입력해 주세요", detail: "공백만 있는 메시지는 보낼 수 없습니다." },
  message_too_long: { tone: "error", title: "메시지가 너무 깁니다", detail: "채팅은 200자까지 보낼 수 있습니다. (이모지는 2자로 계산)" },
  authentication_required: { tone: "error", title: "계정 재연결 필요", detail: "Spoon 인증이 만료되었습니다." },
  missing_scope: { tone: "error", title: "채팅 권한 필요", detail: "다시 로그인해 '봇 채팅' 권한을 허용해 주세요." },
  chat_blocked: { tone: "error", title: "채팅 전송 제한", detail: "채팅이 잠겨 있거나 봇이 채팅 금지 상태입니다. Spoon 방송 설정을 확인해 주세요." },
  bot_blocked: { tone: "error", title: "방송 입장 차단", detail: "Spoon 방송 설정의 차단 목록에서 NAGU BOT을 해제해 주세요." },
  offline: { tone: "error", title: "방송 전입니다", detail: "방송을 시작한 뒤 다시 보내 주세요." },
  rate_limited: { tone: "error", title: "채팅이 혼잡합니다", detail: "잠시 기다린 뒤 다시 보내 주세요." },
  daily_limited: { tone: "error", title: "오늘 채팅 한도 초과", detail: "Spoon이 정한 하루 사용량을 모두 썼습니다. 자정이 지나면 다시 보낼 수 있습니다." },
  unavailable: { tone: "error", title: "채팅 전송 실패", detail: "일시적인 오류입니다. 잠시 후 다시 시도해 주세요." },
};

const settingsNotices: Record<string, { tone: "success" | "error"; text: string }> = {
  greeting_sent: { tone: "success", text: "인사말을 저장하고 현재 방송 채팅에 바로 보냈습니다." },
  feature_saved: { tone: "success", text: "자동화 설정을 저장했습니다. 다음 이벤트부터 적용됩니다." },
  nickname_saved: { tone: "success", text: "DJ 표시 이름을 저장했습니다." },
  command_saved: { tone: "success", text: "명령어를 추가했습니다." },
  command_updated: { tone: "success", text: "명령어를 수정했습니다." },
  command_deleted: { tone: "success", text: "명령어를 삭제했습니다." },
  invalid_greeting: { tone: "error", text: "인사말은 1자 이상 200자 이하로 입력해 주세요." },
  invalid_nickname: { tone: "error", text: "DJ 표시 이름은 50자 이하로 입력해 주세요." },
  invalid_command: { tone: "error", text: "명령어는 !로 시작해 20자 이하, 응답은 200자 이하로 입력해 주세요." },
  reserved_command: { tone: "error", text: "기본 명령어는 추가하거나 수정할 수 없습니다." },
  command_conflict: { tone: "error", text: "같은 이름의 명령어가 있거나 수정할 명령어를 찾지 못했습니다." },
  invalid_message: { tone: "error", text: "메시지는 1자 이상 200자 이하로 입력해 주세요." },
  invalid_interval: { tone: "error", text: "반복 간격은 1분 이상 1440분 이하로 입력해 주세요." },
  counter_saved: { tone: "success", text: "카운터를 저장했습니다." },
  counter_deleted: { tone: "success", text: "카운터를 삭제했습니다." },
  counter_conflict: { tone: "error", text: "같은 이름의 카운터가 이미 있습니다." },
  counter_name_taken: { tone: "error", text: "기본 명령어나 등록된 채팅 명령어와 같은 이름은 쓸 수 없습니다." },
  command_counter_conflict: { tone: "error", text: "같은 이름의 카운터가 있어 명령어로 등록할 수 없습니다." },
  invalid_counter: { tone: "error", text: "이름은 공백 없이 20자 이하, 개수는 0~1,000,000으로 입력해 주세요." },
  song_request_deleted: { tone: "success", text: "신청곡을 삭제했습니다." },
  song_requests_cleared: { tone: "success", text: "신청곡 목록을 모두 비웠습니다." },
  backup_restored: { tone: "success", text: "로컬 백업을 복원했습니다." },
  backup_invalid: { tone: "error", text: "백업 파일이 올바르지 않습니다. NAGU BOT에서 내려받은 백업 파일인지 확인해 주세요." },
  backup_too_large: { tone: "error", text: "백업 파일은 10MB 이하만 복원할 수 있습니다." },
};

const FOLLOW_NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  followed: { tone: "success", text: "봇이 DJ를 팔로우했습니다. 방송이 끝나면 Spoon에서 봇을 고정 매니저로 지정해 주세요." },
  offline: { tone: "error", text: "방송 중에만 팔로우할 수 있습니다. 방송을 시작한 뒤 다시 눌러 주세요." },
  follow_rejected: { tone: "error", text: "봇 계정이 이 DJ를 팔로우할 수 없습니다. Spoon에서 봇을 차단하지 않았는지 확인해 주세요." },
  missing_scope: { tone: "error", text: "‘DJ 팔로우’ 권한이 없습니다. 다시 로그인해 권한을 허용해 주세요." },
  authentication_required: { tone: "error", text: "로그인이 만료되었습니다. 다시 로그인해 주세요." },
  unavailable: { tone: "error", text: "Spoon이 잠시 응답하지 않습니다. 잠시 후 다시 시도해 주세요." },
};

const automationTabs = [
  ["welcome", "입장 환영"],
  ["donation", "후원 감사"],
  ["heart", "하트 감사"],
  ["follow", "팔로우 감사"],
  ["repeat", "반복 공지"],
  ["counters", "카운터"],
  ["commands", "채팅 명령어"],
  ["requests", "신청곡"],
] as const;

function groupRouletteKeeps(keeps: RouletteKeep[]) {
  const users = new Map<string, {
    userId: string;
    nickname: string;
    items: Array<{ label: string; count: number }>;
  }>();
  for (const keep of keeps) {
    const user = users.get(keep.userId) ?? {
      userId: keep.userId,
      nickname: keep.nickname,
      items: [],
    };
    user.nickname = keep.nickname;
    user.items.push({ label: keep.itemLabel, count: keep.count });
    users.set(keep.userId, user);
  }
  return [...users.values()];
}

function normalizeRoulettePercentages(
  items: Array<{ id: number; weight: number }>,
  missWeight: number,
) {
  const entries = [
    { key: "miss", weight: Math.max(0, missWeight) },
    ...items.map((item) => ({ key: String(item.id), weight: Math.max(0, item.weight) })),
  ];
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total === 0) entries[0].weight = 1;
  const divisor = total || 1;
  const shares = entries.map((entry) => {
    const exact = (entry.weight / divisor) * 10_000;
    return { ...entry, basisPoints: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const remaining = 10_000 - shares.reduce((sum, share) => sum + share.basisPoints, 0);
  const order = [...shares].sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; index < remaining; index += 1) order[index % order.length].basisPoints += 1;
  const format = (basisPoints: number) => (basisPoints / 100).toFixed(2).replace(/\.00$/u, "");
  return new Map(shares.map((share) => [share.key, format(share.basisPoints)]));
}

function summarizeEvent(event: BotEvent) {
  const name = event.data.user.nickname ?? "익명";

  switch (event.type) {
    case "chat":
      return `${name}: ${event.data.message}`;
    case "presence":
      return `${name}님이 입장했습니다.`;
    case "like":
      return `${name}님이 하트 ${event.data.totalAmount.toLocaleString("ko-KR")}개를 보냈습니다.`;
    case "donation":
      return `${name}님이 ${event.data.amount.toLocaleString("ko-KR")}스푼을 후원했습니다.`;
    case "follow":
      return `${name}님이 DJ를 팔로우했습니다.`;
  }
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const previewConnected = process.env.NODE_ENV === "development" && params.preview === "connected";
  const isBotTab = params.tab === "bot";
  const isGameTab = params.tab === "game";
  const isBackupTab = params.tab === "backup";
  const isDashboardTab = !isBotTab && !isGameTab && !isBackupTab;
  const gameTab = params.game === "roulette"
    ? "roulette"
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
  return (
    <div className="site-shell">
      <SiteHeader connectionStatus={connected ? "connected" : "waiting"} />

      <main>
        {isDashboardTab && !connected && <section className="hero" aria-labelledby="page-title">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow">SPOON LIVE ASSISTANT</p>
              <h1 id="page-title">방송 운영을<br />더 편리하게</h1>
              <p className="summary">NAGU BOT이 반복 안내와 채팅 명령을 돕습니다.</p>
            </div>
            <div className="hero-visual">
              <Image
                src={naguBot}
                alt="NAGU BOT 캐릭터"
                priority
                sizes="(max-width: 760px) 280px, 400px"
              />
            </div>
          </div>
        </section>}

        <section className="connection-section" aria-labelledby="connection-title">
          <div className="connection-card">
            <div className="connection-copy">
              <p className="section-label">DJ 로그인</p>
              <h2 id="connection-title">
                {connected
                  ? "Spoon DJ 계정으로 로그인했습니다"
                  : connectionBlocked
                    ? "관리자가 연결을 차단했습니다"
                    : "Spoon DJ 계정으로 로그인해 주세요"}
              </h2>
              <p>
                {connected
                  ? "NAGU BOT이 방송을 도울 준비가 됐습니다."
                  : connectionBlocked
                    ? "차단이 풀리기 전에는 다시 로그인하거나 봇을 입장시킬 수 없습니다."
                    : "방송에 사용하는 DJ 계정을 연결하고 NAGU BOT의 방송·채팅 권한에 동의해 주세요."}
              </p>
            </div>

            {connected && missingRequiredScopes.length === 0 && (
              <div className="notice success" role="status">
                <span className="notice-icon" aria-hidden="true">✓</span>
                <div>
                  <strong>DJ 로그인 완료</strong>
                  <span>필요한 권한을 모두 허용했습니다.</span>
                </div>
              </div>
            )}

            {connected && missingRequiredScopes.length > 0 && (
              <div className="notice info" role="status">
                <span className="notice-icon" aria-hidden="true">i</span>
                <div>
                  <strong>일부 권한이 승인되지 않았습니다</strong>
                  <span>{missingRequiredScopes.map((scope) => scopeLabels[scope]).join(", ")} 권한이 없어 일부 정보가 표시되지 않습니다. 아래 [권한 다시 허용하기]를 눌러 주세요.</span>
                </div>
              </div>
            )}

            {connectionError && (
              <div className="notice error" role="alert">
                <span className="notice-icon" aria-hidden="true">!</span>
                <div>
                  <strong>{allScopesRequired ? "모든 권한을 선택해 주세요" : "연결 실패"}</strong>
                  <span>{connectionError}</span>
                </div>
              </div>
            )}

            {disconnected && !connected && (
              <div className="notice success" role="status">
                <span className="notice-icon" aria-hidden="true">✓</span>
                <div>
                  <strong>연결 해제 완료</strong>
                  <span>Spoon 로그인 정보를 안전하게 삭제했습니다.</span>
                </div>
              </div>
            )}

            {connected && scopes.length > 0 && (
              <div className="permissions" aria-label="허용된 권한">
                {scopes.map((scope) => (
                  <span key={scope}>{scopeLabels[scope] ?? scope}</span>
                ))}
              </div>
            )}

            {!connectionBlocked && <div className="connection-actions">
              {connected ? (
                <>
                  {missingRequiredScopes.length > 0 && <OAuthLoginGate label="권한 다시 허용하기" />}
                  <form action="/oauth/disconnect" method="post">
                    <ConfirmButton className="disconnect" type="submit" message="Spoon 연결을 해제할까요? 이 DJ 계정으로 로그인한 모든 기기에서 로그아웃되고, 봇도 방송에서 나갑니다.">연결 해제</ConfirmButton>
                  </form>
                </>
              ) : (
                <OAuthLoginGate label={allScopesRequired ? "권한 다시 허용하기" : "Spoon DJ 계정으로 로그인"} />
              )}
            </div>}

            <p className="privacy">
              별도 회원가입은 필요하지 않습니다. 인증 정보는 암호화되며 Spoon 비밀번호는 저장하지 않습니다.
            </p>
          </div>

          {!workspaceLinked && (
            <div className="notice link-notice" role="status">
              <span className="notice-icon" aria-hidden="true">i</span>
              <div>
                <strong>이전에 저장한 설정을 아직 불러오지 않았습니다.</strong>
                <span>이 브라우저에서 처음 로그인했다면, 방송 중 DJ 계정으로 채팅을 한 번 입력하면 저장된 설정과 기록을 자동으로 불러옵니다. 그 전에 바꾼 설정은 저장된 설정으로 덮어써질 수 있습니다.</span>
              </div>
            </div>
          )}
          {connected && bot && (
            <div className="bot-bar">
              <ClearStatusParams keys="rps raffle quiz roulette settings chat chatMessage bot status follow" />
              <span className={`bot-bar-state${bot.state === "connected" ? " is-live" : ""}`}>
                <span className="status-dot" aria-hidden="true" />
                봇 {botStateLabels[bot.state]}
              </span>
              <form action={bot.enabled ? "/bot/leave" : "/bot/join"} method="post">
                <ConfirmButton
                  className={`bot-bar-button${bot.enabled ? " is-leave" : ""}`}
                  type="submit"
                  disabled={!bot.enabled && !hasEventScope}
                  message={bot.enabled ? "봇을 방송에서 내보낼까요? 자동 인사와 게임이 멈춥니다." : ""}
                >
                  {bot.enabled ? "봇 퇴장" : "봇 입장"}
                </ConfirmButton>
              </form>
              <Link className="bot-bar-link" href="/remote">휴대폰 리모컨</Link>
            </div>
          )}
          {connected && <nav className="dashboard-tabs" aria-label="운영 메뉴">
            <Link scroll={false} className={isDashboardTab ? "is-active" : ""} href="/" aria-current={isDashboardTab ? "page" : undefined}>
              대시보드
            </Link>
            <Link scroll={false} className={isBotTab ? "is-active" : ""} href="/?tab=bot" aria-current={isBotTab ? "page" : undefined}>
              봇 운영
            </Link>
            <Link scroll={false} className={isGameTab ? "is-active" : ""} href="/?tab=game&game=rps" aria-current={isGameTab ? "page" : undefined}>
              게임
            </Link>
            <Link scroll={false} className={isBackupTab ? "is-active" : ""} href="/?tab=backup" aria-current={isBackupTab ? "page" : undefined}>
              데이터 백업
            </Link>
          </nav>}

          {isDashboardTab && connected && liveStatus && (
            <article className="live-card" aria-labelledby="live-title">
              <div className="live-heading">
                <div>
                  <p className="section-label">방송 상태</p>
                  <div className="live-title-row">
                    <h2 id="live-title">
                      {liveStatus.kind === "live" ? liveStatus.live.title : "현재 방송 정보"}
                    </h2>
                    <RefreshLiveButton />
                  </div>
                </div>
                <span className={`live-badge ${liveStatus.kind === "live" ? "is-live" : ""}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {liveStatus.kind === "live" ? "ON AIR" : "OFF AIR"}
                </span>
              </div>

              {liveStatus.kind === "live" && (
                <>
                  <dl className="live-metrics">
                    <div>
                      <dt>현재 청취자</dt>
                      <dd>{liveStatus.live.listenerCount.toLocaleString("ko-KR")}명</dd>
                    </div>
                    <div>
                      <dt>누적 청취자</dt>
                      <dd>{liveStatus.live.totalListenerCount.toLocaleString("ko-KR")}명</dd>
                    </div>
                    <div>
                      <dt>방송 시작</dt>
                      <dd>{formatDateTime(liveStatus.live.startedAt)}</dd>
                    </div>
                    <div>
                      <dt>채팅 상태</dt>
                      <dd className={liveStatus.live.isChatFrozen ? "is-frozen" : ""}>
                        {liveStatus.live.isChatFrozen ? "채팅 잠김" : "채팅 가능"}
                      </dd>
                    </div>
                  </dl>

                  {liveStatus.live.welcomeMessage && (
                    <div className="live-message">
                      <span>Spoon 방송 인사말 · 읽기 전용</span>
                      <p>{liveStatus.live.welcomeMessage}</p>
                    </div>
                  )}

                  {(liveStatus.live.categories.length > 0 || liveStatus.live.tags.length > 0) && (
                    <div className="live-tags" aria-label="방송 카테고리와 태그">
                      {liveStatus.live.categories.map((category) => (
                        <span key={`category-${category}`}>{category === "iteconomy" ? "태그" : category}</span>
                      ))}
                      {liveStatus.live.tags.map((tag) => (
                        <span key={`tag-${tag}`}>#{tag}</span>
                      ))}
                    </div>
                  )}
                </>
              )}

              {liveStatus.kind === "offline" && (
                <p className="live-empty">현재 진행 중인 방송이 없습니다.</p>
              )}

              {liveStatus.kind === "missing_scope" && (
                <div className="notice info" role="status">
                  <span className="notice-icon" aria-hidden="true">i</span>
                  <div>
                    <strong>방송 정보가 표시되지 않습니다</strong>
                    <span>‘방송 정보’ 권한이 없어 표시할 수 없습니다. <a className="permission-link" href="#connection-title">권한 다시 허용하기</a></span>
                  </div>
                </div>
              )}

              {liveStatus.kind === "unavailable" && (
                <div className="notice error" role="alert">
                  <span className="notice-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>방송 정보를 불러오지 못했습니다</strong>
                    <span>잠시 후 새로고침해 주세요.</span>
                  </div>
                </div>
              )}

            </article>
          )}

          {isDashboardTab && connected && (
            <article className="audience-card" aria-labelledby="audience-title">
              <div className="audience-heading">
                <div>
                  <p className="section-label">방송 구성원</p>
                  <h2 id="audience-title">청취자와 팬 랭킹</h2>
                </div>
                <RefreshButton label="목록" />
              </div>

              <div className="audience-columns">
                <section aria-labelledby="listeners-title">
                  <div className="audience-section-heading">
                    <h3 id="listeners-title">현재 청취자</h3>
                    {audienceResult.listeners.kind === "ready" && (
                      <span>{audienceResult.listeners.items.length.toLocaleString("ko-KR")}명</span>
                    )}
                  </div>
                  {audienceResult.listeners.kind === "ready" && audienceResult.listeners.items.length > 0 && (
                    <ol className="listener-list">
                      {audienceResult.listeners.items.map((listener) => (
                        <li key={listener.id}>
                          <span className="listener-avatar" aria-hidden="true">
                            {listener.nickname.slice(0, 1) || "?"}
                          </span>
                          <strong>{listener.nickname}</strong>
                          {listener.subscription && <span className="subscriber-badge">구독</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {audienceResult.listeners.kind === "ready" && audienceResult.listeners.items.length === 0 && (
                    <p className="audience-empty">현재 청취자가 없습니다.</p>
                  )}
                  {audienceResult.listeners.kind === "offline" && <p className="audience-empty">방송 전입니다.</p>}
                  {audienceResult.listeners.kind === "missing_scope" && (
                    <p className="audience-empty">‘청취자 목록’ 권한이 없어 표시할 수 없습니다. <a className="permission-link" href="#connection-title">권한 다시 허용하기</a></p>
                  )}
                  {(audienceResult.listeners.kind === "unavailable" || audienceResult.listeners.kind === "unauthorized") && (
                    <p className="audience-empty">청취자 목록을 불러오지 못했습니다.</p>
                  )}
                </section>

                <section aria-labelledby="fans-title">
                  <div className="audience-section-heading">
                    <h3 id="fans-title">팬 랭킹</h3>
                    {audienceResult.fans.kind === "ready" && (
                      <span>상위 {audienceResult.fans.items.length}명</span>
                    )}
                  </div>
                  {audienceResult.fans.kind === "ready" && audienceResult.fans.items.length > 0 && (
                    <ol className="fan-list">
                      {audienceResult.fans.items.map((fan) => (
                        <li key={fan.id}>
                          <span className="fan-rank">{fan.rank}</span>
                          <strong>{fan.nickname}</strong>
                          <span>{(fan.spoonCount ?? 0).toLocaleString("ko-KR")}스푼</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {audienceResult.fans.kind === "ready" && audienceResult.fans.items.length === 0 && (
                    <p className="audience-empty">현재 랭킹에 오른 팬이 없습니다.</p>
                  )}
                  {audienceResult.fans.kind === "offline" && <p className="audience-empty">방송 전입니다.</p>}
                  {audienceResult.fans.kind === "missing_scope" && (
                    <p className="audience-empty">‘팬 랭킹’ 권한이 없어 표시할 수 없습니다. <a className="permission-link" href="#connection-title">권한 다시 허용하기</a></p>
                  )}
                  {(audienceResult.fans.kind === "unavailable" || audienceResult.fans.kind === "unauthorized") && (
                    <p className="audience-empty">팬 랭킹을 불러오지 못했습니다.</p>
                  )}
                </section>
              </div>

              <div className="audience-heart-summary">
                <span>받은 하트</span>
                <strong>{(bot?.activity.hearts ?? 0).toLocaleString("ko-KR")}개</strong>
                <p>봇이 입장한 뒤부터 센 하트 수입니다.</p>
              </div>

              <p className="audience-footnote">청취자 목록에 NAGU BOT 계정이 함께 보일 수 있습니다.</p>
            </article>
          )}

          {isDashboardTab && connected && bot && (
            <article className="event-card" aria-labelledby="recent-events-title">
              <div className="event-feed">
                <div className="event-feed-heading">
                  <div>
                    <p className="section-label">방송 활동</p>
                    <h2 id="recent-events-title">최근 활동</h2>
                  </div>
                  <RefreshButton label="이벤트" />
                </div>
                {bot.events.length > 0 ? (
                  <ol>
                    {bot.events.map((event, index) => (
                      <li key={event.id ?? `${event.receivedAt}-${index}`}>
                        <span className={`event-type is-${event.type}`}>
                          {scopeLabels[`events.${event.type}`]}
                        </span>
                        <p>{summarizeEvent(event)}</p>
                        <time dateTime={event.receivedAt}>{formatDateTime(event.receivedAt)}</time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="event-empty">아직 들어온 입장·채팅·하트·후원이 없습니다.</p>
                )}
              </div>
            </article>
          )}

          {isGameTab && connected && bot && (
            <article className="game-card" aria-labelledby="game-title">
              <div className="game-heading">
                <div>
                  <p className="section-label">방송 게임</p>
                  <h2 id="game-title">게임</h2>
                </div>
                <Link className="remote-link" href="/remote">휴대폰 리모컨 열기</Link>
              </div>

              <nav className="game-tabs" aria-label="게임 선택">
                <Link scroll={false} className={gameTab === "rps" ? "is-active" : ""} href="/?tab=game&game=rps">가위바위보</Link>
                <Link scroll={false} className={gameTab === "raffle" ? "is-active" : ""} href="/?tab=game&game=raffle">추첨</Link>
                <Link scroll={false} className={gameTab === "quiz" ? "is-active" : ""} href="/?tab=game&game=quiz">퀴즈</Link>
                <Link scroll={false} className={gameTab === "roulette" ? "is-active" : ""} href="/?tab=game&game=roulette">룰렛</Link>
              </nav>

              <details className="dj-command-help">
                <summary>방송 화면을 벗어나지 않고 채팅으로 진행하기 (DJ 전용 명령어)</summary>
                <p>DJ 계정으로 방송 채팅에 입력하면 이 화면의 버튼과 똑같이 동작합니다. 봇이 방송에 입장해 있어야 합니다. PC로 방송한다면 휴대폰에서 <Link href="/remote">리모컨</Link>을 열어 써도 됩니다.</p>
                <ul>
                  {DJ_COMMAND_HELP.map((line) => <li key={line}><code>{line}</code></li>)}
                </ul>
              </details>

              {gameTab === "rps" && (
                <section className="game-panel" aria-labelledby="rps-title">
                  {rpsRound?.active && <AutoRefresh intervalMs={2000} />}
                  <div className="game-panel-heading">
                    <div>
                      <h3 id="rps-title">DJ vs 청취자 가위바위보</h3>
                      <p>DJ가 선택한 뒤 라운드를 시작하면 청취자는 방송 채팅에서 한 번 참여할 수 있습니다. 채팅의 <code>!가위바위보 시작</code>은 DJ 선택을 랜덤으로 정합니다.</p>
                    </div>
                    <span className={`game-state ${rpsRound?.active ? "is-active" : ""}`}>
                      {rpsRound?.active ? "진행 중" : "대기"}
                    </span>
                  </div>

                  {params.rps === "started" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>가위바위보 라운드를 시작했습니다.</strong></div>}
                  {params.rps === "finished" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>결과를 방송 채팅에 공개했습니다.</strong></div>}
                  {params.rps === "already_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 라운드를 먼저 종료해 주세요.</strong></div>}
                  {params.rps === "not_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 라운드가 없습니다.</strong></div>}
                  {params.rps === "bot_required" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>봇을 방송에 입장시킨 뒤 시작해 주세요.</strong></div>}
                  {params.rps === "missing_scope" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>채팅 이벤트와 전송 권한이 필요합니다.</strong></div>}

                  {rpsRound?.active ? (
                    <div className="rps-active-round">
                      <div className="rps-round-number"><span>라운드</span><strong>#{rpsRound.roundId}</strong></div>
                      <div className="rps-live-count" role="status" aria-live="polite" aria-atomic="true">
                        <span>실시간 참여자</span>
                        <strong>{rpsRound.entries.length.toLocaleString("ko-KR")}<small>명</small></strong>
                      </div>
                      <form action="/game/rps" method="post">
                        <input type="hidden" name="action" value="finish" />
                        <button className="rps-finish" type="submit">라운드 종료 및 결과 공개</button>
                      </form>
                    </div>
                  ) : (
                    <form className="rps-start-form" action="/game/rps" method="post">
                      <input type="hidden" name="action" value="start" />
                      <fieldset disabled={!bot.enabled || !hasChatScope || !scopes.includes("events.chat")}>
                        <legend>DJ 선택</legend>
                        <div className="rps-choice-control">
                          {(["가위", "바위", "보"] as const).map((choice) => (
                            <label key={choice}><input type="radio" name="choice" value={choice} required /><span>{choice}</span></label>
                          ))}
                          <label><input type="radio" name="choice" value="random" defaultChecked required /><span>랜덤</span></label>
                        </div>
                        <button type="submit">라운드 시작</button>
                      </fieldset>
                    </form>
                  )}

                  {rpsHistory.length > 0 && (
                    <section className="rps-history" aria-labelledby="rps-history-title">
                      <div className="rps-history-heading">
                        <h4 id="rps-history-title">라운드 기록</h4>
                        <span>최근 {rpsHistory.length}개</span>
                      </div>
                      {rpsHistory.map((round, index) => {
                        const wins = round.entries.filter((entry) => entry.result === "win").length;
                        const draws = round.entries.filter((entry) => entry.result === "draw").length;
                        const losses = round.entries.filter((entry) => entry.result === "lose").length;
                        return (
                          <details className="rps-history-round" key={round.roundId} open={index === 0}>
                            <summary>
                              <span><strong>라운드 #{round.roundId}</strong><small>{formatDateTime(round.endedAt ?? round.startedAt)}</small></span>
                              <span>DJ {round.djChoice}</span>
                              <span>참여 {round.entries.length}명 · 승 {wins} · 무 {draws} · 패 {losses}</span>
                            </summary>
                            {round.entries.length > 0 ? (
                              <ol>
                                {round.entries.map((entry) => (
                                  <li key={entry.userId}>
                                    <strong>{entry.nickname}</strong>
                                    <span>{entry.choice}</span>
                                    <em className={`is-${entry.result}`}>
                                      {entry.result === "win" ? "승리" : entry.result === "draw" ? "무승부" : "패배"}
                                    </em>
                                  </li>
                                ))}
                              </ol>
                            ) : <p>참가자가 없는 라운드입니다.</p>}
                          </details>
                        );
                      })}
                    </section>
                  )}

                  <p className="game-command"><code>!가위바위보 가위</code> <code>!가위바위보 바위</code> <code>!가위바위보 보</code></p>
                </section>
              )}

              {gameTab === "raffle" && (
                <section className="game-panel" aria-labelledby="raffle-title">
                  {raffleRound?.active && <AutoRefresh intervalMs={2000} />}
                  <div className="game-panel-heading">
                    <div>
                      <h3 id="raffle-title">추첨</h3>
                      <p>당첨 인원을 정해 시작하면 청취자가 방송 채팅에서 <code>!참여</code>로 한 번 참여할 수 있습니다.</p>
                    </div>
                    <span className={`game-state ${raffleRound?.active ? "is-active" : ""}`}>
                      {raffleRound?.active ? "진행 중" : "대기"}
                    </span>
                  </div>

                  {params.raffle === "started" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>추첨을 시작했습니다.</strong></div>}
                  {params.raffle === "finished" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>당첨자를 확정하고 방송 채팅에 공개했습니다.</strong></div>}
                  {params.raffle === "already_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 추첨을 먼저 종료해 주세요.</strong></div>}
                  {params.raffle === "not_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 추첨이 없습니다.</strong></div>}
                  {params.raffle === "invalid_winner_count" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>당첨 인원은 1명 이상 {MAX_RAFFLE_WINNERS.toLocaleString("ko-KR")}명 이하의 정수로 입력해 주세요.</strong></div>}
                  {params.raffle === "bot_required" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>봇을 방송에 입장시킨 뒤 시작해 주세요.</strong></div>}
                  {params.raffle === "missing_scope" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>채팅 이벤트와 전송 권한이 필요합니다.</strong></div>}

                  {raffleRound?.active ? (
                    <div className="rps-active-round">
                      <div className="rps-round-number">
                        <span>라운드</span>
                        <strong>#{raffleRound.roundId} · 최대 {raffleRound.winnerCount}명 당첨</strong>
                      </div>
                      <div className="rps-live-count" role="status" aria-live="polite" aria-atomic="true">
                        <span>실시간 참여자</span>
                        <strong>{raffleRound.entries.length.toLocaleString("ko-KR")}<small>명</small></strong>
                      </div>
                      <form action="/game/raffle" method="post">
                        <input type="hidden" name="action" value="finish" />
                        <button className="rps-finish" type="submit">추첨 종료 및 당첨자 공개</button>
                      </form>
                    </div>
                  ) : (
                    <form className="rps-start-form raffle-start-form" action="/game/raffle" method="post">
                      <input type="hidden" name="action" value="start" />
                      <fieldset disabled={!bot.enabled || !hasChatScope || !scopes.includes("events.chat")}>
                        <legend>당첨 인원</legend>
                        <label className="raffle-winner-count">
                          <input type="number" name="winnerCount" min={1} max={MAX_RAFFLE_WINNERS} step={1} defaultValue={1} required />
                          <span>명</span>
                        </label>
                        <button type="submit">추첨 시작</button>
                      </fieldset>
                    </form>
                  )}

                  {raffleHistory.length > 0 && (
                    <section className="rps-history" aria-labelledby="raffle-history-title">
                      <div className="rps-history-heading">
                        <h4 id="raffle-history-title">추첨 기록</h4>
                        <span>최근 {raffleHistory.length}개</span>
                      </div>
                      {raffleHistory.map((round, index) => {
                        const winnerTotal = round.entries.filter((entry) => entry.winner).length;
                        return (
                          <details className="rps-history-round" key={round.roundId} open={index === 0}>
                            <summary>
                              <span><strong>라운드 #{round.roundId}</strong><small>{formatDateTime(round.endedAt ?? round.startedAt)}</small></span>
                              <span>당첨 {winnerTotal}명</span>
                              <span>참여 {round.entries.length}명 · 설정 {round.winnerCount}명</span>
                            </summary>
                            {round.entries.length > 0 ? (
                              <ol>
                                {round.entries.map((entry) => (
                                  <li key={entry.userId}>
                                    <strong>{entry.nickname}</strong>
                                    <span>참여</span>
                                    <em className={entry.winner ? "is-win" : ""}>{entry.winner ? "당첨" : "미당첨"}</em>
                                  </li>
                                ))}
                              </ol>
                            ) : <p>참가자가 없는 라운드입니다.</p>}
                          </details>
                        );
                      })}
                    </section>
                  )}

                  <p className="game-command"><code>!참여</code></p>
                </section>
              )}

              {gameTab === "quiz" && (
                <section className="game-panel" aria-labelledby="quiz-title">
                  {quizRound?.active && <AutoRefresh intervalMs={2000} />}
                  <div className="game-panel-heading">
                    <div>
                      <h3 id="quiz-title">퀴즈</h3>
                      <p>청취자가 <code>!정답 (답)</code>으로 답을 내면 가장 먼저 맞힌 사람을 자동으로 찾아 줍니다.</p>
                    </div>
                    <span className={`game-state ${quizRound?.active ? "is-active" : ""}`}>
                      {quizRound?.active ? "진행 중" : "대기"}
                    </span>
                  </div>

                  {params.quiz === "started" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>퀴즈 문제를 방송 채팅에 공개했습니다.</strong></div>}
                  {params.quiz === "finished" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>퀴즈를 종료하고 정답을 공개했습니다.</strong></div>}
                  {params.quiz === "already_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 퀴즈를 먼저 종료해 주세요.</strong></div>}
                  {params.quiz === "not_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 퀴즈가 없습니다.</strong></div>}
                  {params.quiz === "invalid_quiz" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>문제는 180자 이하, 정답은 100자 이하로 입력해 주세요.</strong></div>}
                  {params.quiz === "bot_required" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>봇을 방송에 입장시킨 뒤 시작해 주세요.</strong></div>}
                  {params.quiz === "missing_scope" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>채팅 이벤트와 전송 권한이 필요합니다.</strong></div>}
                  {params.quiz === "queued" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>대기 문제에 추가했습니다. 방송 중 <code>!퀴즈 시작</code>으로 출제됩니다.</strong></div>}
                  {params.quiz === "queue_deleted" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>대기 문제를 삭제했습니다.</strong></div>}
                  {params.quiz === "queue_full" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>대기 문제는 최대 50개까지 등록할 수 있습니다.</strong></div>}
                  {params.quiz === "queue_empty" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>등록된 대기 문제가 없습니다.</strong></div>}

                  {quizRound?.active ? (
                    <>
                      <div className="rps-active-round">
                        <div className="rps-round-number">
                          <span>문제 #{quizRound.roundId}</span>
                          <strong>{quizRound.question}</strong>
                          <small>정답: {quizRound.answer}</small>
                        </div>
                        <div className="rps-live-count" role="status" aria-live="polite" aria-atomic="true">
                          <span>현재 제출자</span>
                          <strong>{quizRound.submissions.length.toLocaleString("ko-KR")}<small>명</small></strong>
                        </div>
                        <form action="/game/quiz" method="post">
                          <input type="hidden" name="action" value="finish" />
                          <button className="rps-finish" type="submit">퀴즈 종료 및 정답 공개</button>
                        </form>
                      </div>
                      {quizRound.submissions.length > 0 && (
                        <section className="rps-history quiz-live-submissions" aria-labelledby="quiz-submissions-title">
                          <div className="rps-history-heading">
                            <h4 id="quiz-submissions-title">최신 제출 순서</h4>
                            <span>다시 제출하면 순서가 뒤로 이동합니다.</span>
                          </div>
                          <ol>
                            {quizRound.submissions.map((submission) => (
                              <li key={submission.userId}>
                                <strong>{submission.nickname}</strong>
                                <span>{submission.answer}</span>
                                <time dateTime={new Date(submission.submittedAt).toISOString()}>{formatDateTime(submission.submittedAt)}</time>
                              </li>
                            ))}
                          </ol>
                        </section>
                      )}
                    </>
                  ) : null}

                  <section className="rps-history quiz-queue" aria-labelledby="quiz-queue-title">
                    <div className="rps-history-heading">
                      <h4 id="quiz-queue-title">대기 문제</h4>
                      <span>방송 전에 등록해 두면 채팅의 <code>!퀴즈 시작</code>으로 위에서부터 출제됩니다. 정답은 채팅에 노출되지 않습니다.</span>
                    </div>
                    {quizQueue.length > 0 ? (
                      <ol>
                        {quizQueue.map((item) => (
                          <li key={item.id}>
                            <strong>{item.question}</strong>
                            <span>정답: {item.answer}</span>
                            <form action="/game/quiz" method="post">
                              <input type="hidden" name="action" value="queue_delete" />
                              <input type="hidden" name="id" value={item.id} />
                              <ConfirmButton className="is-danger" type="submit" message="이 대기 문제를 삭제할까요?">삭제</ConfirmButton>
                            </form>
                          </li>
                        ))}
                      </ol>
                    ) : <p>등록된 대기 문제가 없습니다.</p>}
                    {/* One form, two buttons: Enter (the first button) only queues, so a
                        question meant for later is never published by accident. */}
                    <form className="quiz-queue-form" action="/game/quiz" method="post">
                      <label>문제<input name="question" maxLength={180} placeholder="대한민국의 수도는?" required /></label>
                      <label>정답<input name="answer" maxLength={100} placeholder="서울" required /></label>
                      <div className="quiz-queue-actions">
                        <button type="submit" name="action" value="queue_add">대기 목록에 추가</button>
                        {!quizRound?.active && (
                          <button
                            className="is-secondary"
                            type="submit"
                            name="action"
                            value="start"
                            disabled={!bot.enabled || !hasChatScope || !scopes.includes("events.chat")}
                          >
                            지금 바로 출제
                          </button>
                        )}
                      </div>
                    </form>
                    {!quizRound?.active && quizQueue.length > 0 && (
                      <form action="/game/quiz" method="post">
                        <input type="hidden" name="action" value="start_next" />
                        <button type="submit" disabled={!bot.enabled || !hasChatScope || !scopes.includes("events.chat")}>
                          다음 대기 문제 출제
                        </button>
                      </form>
                    )}
                  </section>

                  {quizHistory.length > 0 && (
                    <section className="rps-history" aria-labelledby="quiz-history-title">
                      <div className="rps-history-heading">
                        <h4 id="quiz-history-title">퀴즈 기록</h4>
                        <span>최근 {quizHistory.length}개</span>
                      </div>
                      {quizHistory.map((round, index) => (
                        <details className="rps-history-round quiz-history-round" key={round.roundId} open={index === 0}>
                          <summary>
                            <span className="quiz-history-question"><small>문제 #{round.roundId}</small><strong>{round.question}</strong></span>
                            <span className="quiz-history-result">최초 정답 - {getFirstCorrectAt(round.submissions) === null
                              ? "없음"
                              : round.submissions.filter((submission) => submission.correctAt === getFirstCorrectAt(round.submissions)).map((submission) => submission.nickname).join(", ")} (정답자 {round.submissions.filter((submission) => submission.correct).length}명)</span>
                          </summary>
                          <p className="quiz-history-answer">정답: <strong>{round.answer}</strong></p>
                          {round.submissions.length > 0 ? (
                            <ol>
                              {round.submissions.map((submission) => (
                                <li key={submission.userId}>
                                  <strong>{submission.nickname}</strong>
                                  <span>{submission.answer}</span>
                                  <em className={submission.correct ? "is-win" : ""}>
                                    {submission.correct
                                      ? `${submission.correctAt === getFirstCorrectAt(round.submissions) ? "최초 정답" : "정답"} · ${formatElapsedTime(Math.max(0, (submission.correctAt ?? round.startedAt) - round.startedAt))}`
                                      : "오답"}
                                  </em>
                                </li>
                              ))}
                            </ol>
                          ) : <p>제출된 답안이 없습니다. 정답은 {round.answer}입니다.</p>}
                        </details>
                      ))}
                    </section>
                  )}

                  <p className="game-command"><code>!정답 정답내용</code></p>
                </section>
              )}

              {gameTab === "roulette" && (
                <section className="game-panel roulette-panel" aria-labelledby="roulette-title">
                  <AutoRefresh intervalMs={2000} />
                  <div className="game-panel-heading">
                    <div>
                      <h3 id="roulette-title">룰렛</h3>
                      <p>청취자가 1회 비용 이상을 한 번에 후원하면 룰렛이 자동으로 한 번 돌아갑니다.</p>
                    </div>
                    <span className={`game-state ${rouletteSettings?.enabled ? "is-active" : ""}`}>
                      {rouletteSettings?.enabled ? "켜짐" : "꺼짐"}
                    </span>
                  </div>

                  {params.roulette === "settings_saved" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>룰렛 설정을 저장했습니다.</strong></div>}
                  {params.roulette === "distribution_saved" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>룰렛 확률표를 저장했습니다.</strong></div>}
                  {params.roulette === "item_deleted" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>경품을 삭제하고 해당 확률을 꽝 확률에 반영했습니다.</strong></div>}
                  {params.roulette === "keeps_updated" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>선택한 킵 수량을 수정했습니다.</strong></div>}
                  {params.roulette === "keeps_deleted" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>선택한 킵을 삭제했습니다.</strong></div>}
                  {params.roulette === "invalid_keeps" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>수정할 킵 항목과 수량을 다시 확인해 주세요.</strong></div>}
                  {params.roulette === "invalid_distribution" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>경품 당첨 확률 합계는 100% 이하여야 하며 같은 경품명은 한 번만 사용할 수 있습니다.</strong></div>}
                  {params.roulette === "invalid_settings" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>룰렛 입력값을 확인해 주세요.</strong></div>}

                  {rouletteSettings && (
                    <form className="roulette-settings-form" action="/game/roulette" method="post">
                      <input type="hidden" name="action" value="settings" />
                      <label className="feature-enabled roulette-enabled"><input type="checkbox" role="switch" name="enabled" defaultChecked={rouletteSettings.enabled} /> 후원 룰렛 사용</label>
                      <label>1회 비용<input type="number" name="cost" min={1} max={1_000_000} defaultValue={rouletteSettings.cost} required /><span>스푼</span></label>
                      <button type="submit">설정</button>
                    </form>
                  )}

                  <RouletteDistributionEditor
                    editing={params.rouletteEdit === "1"}
                    items={rouletteItems.map((item) => ({
                      id: item.id,
                      label: item.label,
                      percentage: roulettePercentages.get(String(item.id)) ?? "0",
                    }))}
                  />

                  <div className="roulette-records">
                    <section aria-labelledby="roulette-history-title">
                      <div className="roulette-section-heading"><div><h4 id="roulette-history-title">당첨 이력</h4><p>최근 {rouletteResults.length}건</p></div></div>
                      {rouletteResults.length > 0 ? <ol className="roulette-history-list">
                        {rouletteResults.map((result) => <li key={result.id}>
                          <div><strong>{result.nickname}</strong><time dateTime={new Date(result.createdAt).toISOString()}>{formatDateTime(result.createdAt)}</time></div>
                          <span className={result.isMiss ? "is-miss" : "is-win"}>{result.isMiss ? "꽝" : result.itemLabel}</span>
                          <small>{result.spoons.toLocaleString("ko-KR")}스푼</small>
                        </li>)}
                      </ol> : <p className="roulette-empty">아직 추첨 이력이 없습니다.</p>}
                    </section>

                    <section aria-labelledby="roulette-keeps-title">
                      {rouletteKeepUsers.length > 0
                        ? <RouletteKeepEditor users={rouletteKeepUsers} disabled={previewConnected} />
                        : <><div className="roulette-section-heading"><div><h4 id="roulette-keeps-title">청취자별 킵</h4><p><code>!내 킵</code>으로 조회</p></div></div><p className="roulette-empty">저장된 킵이 없습니다.</p></>}
                    </section>
                  </div>
                </section>
              )}
            </article>
          )}

          {isBotTab && connected && bot && (
            <article className="bot-card" aria-labelledby="bot-title">
              <div className="bot-heading">
                <div>
                  <p className="section-label">봇 운영</p>
                  <h2 id="bot-title">방송 관리</h2>
                </div>
                <span className={`bot-badge is-${bot.state}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {botStateLabels[bot.state]}
                </span>
              </div>

              <p className="bot-description">
                {bot.enabled
                  ? bot.state === "waiting"
                    ? "방송이 시작되면 NAGU BOT이 자동으로 입장합니다."
                    : "NAGU BOT이 방송에 들어와 채팅을 지켜보고 있습니다."
                  : "[봇 입장]을 누르면 봇이 방송에 들어가 인사, 감사 메시지, 게임을 진행합니다."}
              </p>

              {scopes.includes("events.presence") && (
                <p className="manager-help">
                  Spoon에서 NAGU BOT을 매니저로 지정하면 1분 안에 입장 환영이 켜집니다.
                </p>
              )}

              {params.bot === "started" && bot.enabled && (
                <div className="notice success" role="status">
                  <span className="notice-icon" aria-hidden="true">✓</span>
                  <div>
                    <strong>참여 요청 완료</strong>
                    <span>방송 전이라면 기다렸다가 방송이 시작되면 자동으로 들어갑니다.</span>
                  </div>
                </div>
              )}

              {params.bot === "stopped" && !bot.enabled && (
                <div className="notice success" role="status">
                  <span className="notice-icon" aria-hidden="true">✓</span>
                  <div>
                    <strong>봇 퇴장 완료</strong>
                    <span>봇이 방송에서 나왔습니다.</span>
                  </div>
                </div>
              )}

              {bot.state === "authentication_required" && (
                <div className="notice error" role="alert">
                  <span className="notice-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>계정 재연결 필요</strong>
                    <span>Spoon 인증이 만료되어 봇을 중지했습니다.</span>
                  </div>
                </div>
              )}
              {bot.state === "duplicate_connection" && (
                <div className="notice error" role="alert">
                  <span className="notice-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>다른 곳에서 봇이 연결됨</strong>
                    <span>같은 DJ 계정으로 다른 곳에서 봇이 연결되어 이 연결은 꺼졌습니다. 이 화면에서 쓰려면 [봇 입장]을 다시 눌러 주세요.</span>
                  </div>
                </div>
              )}

              {bot.state === "permission_required" && (
                <div className="notice error" role="alert">
                  <span className="notice-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>이벤트 권한 필요</strong>
                    <span>다시 로그인해 ‘실시간 채팅·입장·하트·후원’ 권한을 허용해 주세요. <a className="permission-link" href="#connection-title">권한 다시 허용하기</a></span>
                  </div>
                </div>
              )}

              {bot.state === "blocked" && (
                <div className="notice error" role="alert">
                  <span className="notice-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>방송 입장 차단</strong>
                    <span>Spoon 방송 설정에서 봇 차단 상태를 확인해 주세요.</span>
                  </div>
                </div>
              )}

              <form action={bot.enabled ? "/bot/leave" : "/bot/join"} method="post">
                <ConfirmButton
                  className={bot.enabled ? "bot-leave" : "bot-join"}
                  type="submit"
                  disabled={!bot.enabled && !hasEventScope}
                  message={bot.enabled ? "봇을 방송에서 내보낼까요? 자동 인사와 게임이 멈춥니다." : ""}
                >
                  {bot.enabled ? "봇 퇴장" : "봇 입장"}
                </ConfirmButton>
              </form>

              {!hasEventScope && (
                <p className="bot-help">‘실시간 채팅·입장·하트·후원’ 권한을 허용한 뒤 입장할 수 있습니다.</p>
              )}

              {scopes.includes("dj.follow") && (
                <section className="bot-follow" aria-labelledby="bot-follow-title">
                  <h3 id="bot-follow-title">고정 매니저 준비</h3>
                  <p>Spoon에서 봇을 고정 매니저로 지정하려면, 방송 중에 봇이 DJ를 먼저 팔로우해야 합니다. 팔로우한 뒤 방송이 끝나면 Spoon에서 봇을 고정 매니저로 지정해 주세요.</p>
                  {params.follow && FOLLOW_NOTICES[params.follow] && (
                    <p className={`bot-follow-notice is-${FOLLOW_NOTICES[params.follow].tone}`} role="status">{FOLLOW_NOTICES[params.follow].text}</p>
                  )}
                  <form action="/bot/follow" method="post">
                    <button type="submit">봇이 DJ 팔로우하기</button>
                  </form>
                </section>
              )}

              {botSettings && (
                <section className="automation-settings" aria-labelledby="automation-title">
                  <div className="automation-heading">
                    <div>
                      <p className="section-label">운영 설정</p>
                      <h3 id="automation-title">방송 자동화 설정</h3>
                    </div>
                    <span>켜기·끄기는 바로 적용 · 문구는 [저장]을 눌러야 적용</span>
                  </div>

                  {settingsNotice && (
                    <div className={`settings-notice is-${settingsNotice.tone}`} role={settingsNotice.tone === "error" ? "alert" : "status"}>
                      <span aria-hidden="true">{settingsNotice.tone === "success" ? "✓" : "!"}</span>
                      <strong>{settingsNotice.text}</strong>
                    </div>
                  )}

                  <form className="dj-name-form" action="/bot/settings" method="post">
                    <input type="hidden" name="mode" value="dj_nickname" />
                    <input type="hidden" name="automation" value={automationTab} />
                    <div>
                      <label htmlFor="dj-display-name">DJ 표시 이름 <span>선택</span></label>
                      <p>봇 인사말에 쓸 DJ 이름입니다. 비워 두면 <strong>DJ</strong>로 표시하고, 방송에서 DJ가 처음 채팅하면 자동으로 채워집니다.</p>
                    </div>
                    <div className="dj-name-field">
                      <input id="dj-display-name" name="djNickname" defaultValue={botSettings.djNickname} maxLength={50} placeholder="DJ" />
                      <button type="submit">저장</button>
                    </div>
                  </form>

                  <nav className="automation-tabs" aria-label="자동화 설정">
                    {automationTabs.map(([key, label]) => (
                      <Link scroll={false} key={key} className={automationTab === key ? "is-active" : ""} href={`/?tab=bot&automation=${key}`}>
                        {label}
                      </Link>
                    ))}
                  </nav>

                  {automationTab === "welcome" && (
                    <form className="automation-feature-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="welcome" />
                      <AutomationToggle feature="welcome" initialEnabled={botSettings.welcomeEnabled} label="입장 환영" />
                      <label htmlFor="welcome-message">입장 인사말</label>
                      <textarea id="welcome-message" name="message" defaultValue={botSettings.greetingMessage} maxLength={200} rows={3} required />
                      <p><code>{"{name}"}</code>은 DJ, <code>{"{nickname}"}</code>은 청취자 닉네임입니다.</p><button type="submit">입장 환영 저장</button>
                    </form>
                  )}

                  {automationTab === "donation" && (
                    <form className="automation-feature-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="donation" />
                      <AutomationToggle feature="donation" initialEnabled={botSettings.donationEnabled} label="후원 감사" />
                      <label htmlFor="donation-message">후원 감사말</label>
                      <textarea id="donation-message" name="message" defaultValue={botSettings.donationMessage} maxLength={200} rows={3} required />
                      <p><code>{"{nickname}"}</code>은 후원자, <code>{"{amount}"}</code>는 스푼 수입니다.</p><button type="submit">후원 감사 저장</button>
                    </form>
                  )}

                  {automationTab === "heart" && (
                    <form className="automation-feature-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="heart" />
                      <AutomationToggle feature="heart" initialEnabled={botSettings.heartEnabled} label="하트 감사" />
                      <label htmlFor="heart-message">하트 감사말</label>
                      <textarea id="heart-message" name="message" defaultValue={botSettings.heartMessage} maxLength={200} rows={3} required />
                      <p><code>{"{nickname}"}</code>은 후원자, <code>{"{milestone}"}</code>은 보낸 하트 수입니다.</p><button type="submit">하트 후원 저장</button>
                    </form>
                  )}

                  {automationTab === "follow" && (
                    <form className="automation-feature-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="follow" />
                      {!scopes.includes("events.follow") && (
                        <p className="feature-unavailable">이 기능은 운영자가 Spoon에서 ‘팔로우’ 권한을 켠 뒤, 다시 로그인하면 사용할 수 있습니다.</p>
                      )}
                      <AutomationToggle feature="follow" initialEnabled={botSettings.followEnabled} label="팔로우 감사" />
                      <label htmlFor="follow-message">팔로우 감사말</label>
                      <textarea id="follow-message" name="message" defaultValue={botSettings.followMessage} maxLength={200} rows={3} required />
                      <p><code>{"{nickname}"}</code>은 팔로우한 청취자입니다. 방송 중 처음 팔로우한 경우에만 인사하며, 봇이 매니저로 지정되어 있어야 합니다.</p><button type="submit">팔로우 감사 저장</button>
                    </form>
                  )}

                  {automationTab === "repeat" && (
                    <form className="automation-feature-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="repeat" />
                      <AutomationToggle feature="repeat" initialEnabled={botSettings.repeatEnabled} label="반복 공지" />
                      <label htmlFor="repeat-interval">반복 간격</label>
                      <div className="interval-field"><input id="repeat-interval" type="number" name="intervalMinutes" min={1} max={1440} defaultValue={botSettings.repeatIntervalMinutes} required /><span>분마다</span></div>
                      <label htmlFor="repeat-message">반복 멘트</label>
                      <textarea id="repeat-message" name="message" defaultValue={botSettings.repeatMessage} maxLength={200} rows={3} required />
                      <p><code>{"{name}"}</code>을 DJ 닉네임으로 바꿉니다. 설정 변경은 1분 이내 반영됩니다.</p><button type="submit">반복 멘트 저장</button>
                    </form>
                  )}

                  {automationTab === "counters" && <div className="counter-editor">
                    <AutoRefresh />
                    <div className="counter-guide">
                      <h4>카운터 관리</h4>
                      <p><code>!실드</code> 조회는 누구나 사용할 수 있고, <code>!실드 +2</code> 또는 <code>!실드 -1</code> 증감은 DJ만 사용할 수 있습니다. 이 규칙은 추가한 모든 카운터에 동일하게 적용됩니다.</p>
                    </div>
                    {botCounters.length > 0 && <div className="counter-list">
                      {botCounters.map((counter) => <section key={counter.id} className="counter-item">
                        <form action="/bot/settings" method="post">
                          <input type="hidden" name="mode" value="save_counter" /><input type="hidden" name="id" value={counter.id} />
                          <label>이름<input name="name" defaultValue={counter.name} maxLength={20} readOnly={counter.name === "실드"} required /></label>
                          <label>개수<input type="number" name="value" min={0} max={1000000} defaultValue={counter.value} required /></label>
                          <button type="submit">수정</button>
                        </form>
                        {counter.name !== "실드" && <div className="counter-actions">
                          <form action="/bot/settings" method="post"><input type="hidden" name="mode" value="delete_counter" /><input type="hidden" name="id" value={counter.id} /><ConfirmButton className="is-danger" type="submit" message={`${counter.name} 카운터를 삭제할까요?`}>삭제</ConfirmButton></form>
                        </div>}
                      </section>)}
                    </div>}
                    <form className="counter-create-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="save_counter" />
                      <label htmlFor="counter-name">새 이름</label><input id="counter-name" name="name" placeholder="실드" maxLength={20} required />
                      <label htmlFor="counter-value">개수</label><input id="counter-value" type="number" name="value" min={0} max={1000000} defaultValue={0} required />
                      <button type="submit">카운터 추가</button>
                    </form>
                  </div>}

                  {automationTab === "commands" && <div className="command-editor">
                    <h4>명령어 관리</h4>
                    <h5 className="command-group-title">기본 명령어 · 누구나 사용</h5>
                    <ul>
                      <li><div><strong>!명령어</strong><span>지금 쓸 수 있는 명령어 보기</span></div></li>
                      <li><div><strong>!안녕</strong><span>청취자 닉네임으로 인사 · 모두 사용 가능</span></div></li>
                      <li><div><strong>!가위바위보 가위·바위·보</strong><span>진행 중인 가위바위보에 한 번 참여</span></div></li>
                      <li><div><strong>!참여</strong><span>진행 중인 추첨에 계정당 한 번 참여 · 모두 사용 가능</span></div></li>
                      <li><div><strong>!정답 정답내용</strong><span>진행 중인 퀴즈에 답안 제출 · 다른 답안으로 다시 제출 가능</span></div></li>
                      <li><div><strong>!신청곡 곡명-가수</strong><span>곡명과 가수로 신청 · 모두 사용 가능</span></div></li>
                      <li><div><strong>!신청곡 목록</strong><span>접수된 신청곡 번호·곡명·가수 조회 · 모두 사용 가능</span></div></li>
                      <li><div><strong>!내 킵</strong><span>내 룰렛 당첨 항목과 수량 조회</span></div></li>
                    </ul>
                    {botCounters.length > 0 && (
                      <>
                        <h5 className="command-group-title">카운터 명령어 · 조회는 누구나</h5>
                        <ul>
                          {botCounters.map((counter) => (
                            <li key={`counter-${counter.id}`}>
                              <div>
                                <strong>!{counter.name}</strong>
                                <span>현재 {counter.name} 개수({counter.value.toLocaleString("ko-KR")}개) 보기 · 누구나</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    <h5 className="command-group-title is-dj-only">DJ 전용</h5>
                    <ul>
                      {botCounters.map((counter) => (
                        <li key={`counter-dj-${counter.id}`}>
                          <div><strong>!{counter.name} +N/-N</strong><span>개수 증가·감소 · DJ만 사용 가능</span></div>
                        </li>
                      ))}
                      <li><div><strong>!신청곡 삭제 번호</strong><span>접수된 신청곡 삭제 · DJ만 사용 가능</span></div></li>
                      <li><div><strong>!킵 삭제 닉네임 / 항목명 / 수량</strong><span>사용자 킵을 지정 수량만큼 삭제 · 수량 생략 시 1개</span></div></li>
                    </ul>
                    <h5 className="command-group-title">사용자 정의 명령어 · 누구나 사용</h5>
                    {botCommands.some((item) => !["!명령어", "!안녕"].includes(item.command)) && (
                      <ul>
                        {botCommands.filter((item) => !["!명령어", "!안녕"].includes(item.command)).map((item) => (
                          <li className="command-custom-item" key={item.command}>
                            <form className="command-update-form" action="/bot/settings" method="post">
                              <input type="hidden" name="mode" value="update_command" />
                              <input type="hidden" name="originalCommand" value={item.command} />
                              <input name="command" defaultValue={item.command} maxLength={20} aria-label={`${item.command} 명령어 이름`} required />
                              <input name="response" defaultValue={item.response} maxLength={200} aria-label={`${item.command} 응답`} required />
                              <button type="submit">수정</button>
                            </form>
                            <form className="command-delete-form" action="/bot/settings" method="post">
                              <input type="hidden" name="mode" value="delete_command" />
                              <input type="hidden" name="command" value={item.command} />
                              <ConfirmButton type="submit" aria-label={`${item.command} 삭제`} message={`${item.command} 명령어를 삭제할까요?`}>삭제</ConfirmButton>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form className="command-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="upsert_command" />
                      <label htmlFor="command-name">명령어<input id="command-name" name="command" placeholder="!규칙" maxLength={20} required /></label>
                      <label htmlFor="command-response">응답 메시지<input id="command-response" name="response" placeholder="추가할 응답 메시지" maxLength={200} required /></label>
                      <button type="submit">추가</button>
                    </form>
                  </div>}

                  {automationTab === "requests" && <div className="song-request-editor">
                    <div className="counter-guide">
                      <h4>신청곡 관리</h4>
                      <p>청취자는 <code>!신청곡 곡명-가수</code>로 신청하고 <code>!신청곡 목록</code>으로 전체 목록을 확인할 수 있습니다. DJ는 채팅의 <code>!신청곡 삭제 번호</code> 또는 여기서 삭제할 수 있습니다.</p>
                    </div>
                    {songRequests.length > 0 ? <ol className="song-request-list">
                      {songRequests.map((request) => <li key={request.id}>
                        <span className="song-request-number">#{request.id}</span>
                        <div><strong>{request.artist ? `${request.title} - ${request.artist}` : request.title}</strong><span>{request.requesterNickname} · {formatDateTime(request.createdAt)}</span></div>
                        <form action="/bot/settings" method="post">
                          <input type="hidden" name="mode" value="delete_song_request" />
                          <input type="hidden" name="id" value={request.id} />
                          <button type="submit" aria-label={`${request.title}${request.artist ? ` - ${request.artist}` : ""} 신청곡 삭제`}>삭제</button>
                        </form>
                      </li>)}
                    </ol> : <p className="song-request-empty">접수된 신청곡이 없습니다.</p>}
                    {songRequests.length > 0 && <form className="song-request-clear" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="clear_song_requests" />
                      <ConfirmButton type="submit" message={`신청곡 ${songRequests.length}개를 모두 지울까요?`}>전체 비우기</ConfirmButton>
                    </form>}
                  </div>}
                </section>
              )}

              <div className="chat-console">
                <div className="chat-console-heading">
                  <div>
                    <p className="section-label">채팅 전송</p>
                    <h3>봇 메시지</h3>
                  </div>
                  <span>최대 200자</span>
                </div>

                {chatNotice && (
                  <div className={`notice ${chatNotice.tone}`} role={chatNotice.tone === "error" ? "alert" : "status"}>
                    <span className="notice-icon" aria-hidden="true">
                      {chatNotice.tone === "success" ? "✓" : "!"}
                    </span>
                    <div>
                      <strong>{chatNotice.title}</strong>
                      <span>{chatNotice.detail}</span>
                    </div>
                  </div>
                )}

                <form action="/bot/chat" method="post">
                  <label htmlFor="bot-message">보낼 메시지</label>
                  <textarea
                    id="bot-message"
                    name="message"
                    maxLength={200}
                    rows={3}
                    placeholder="방송 채팅에 보낼 메시지를 입력하세요."
                    required
                    disabled={!hasChatScope}
                  />
                  <button type="submit" disabled={!hasChatScope}>채팅 보내기</button>
                </form>

                {!hasChatScope && (
                  <p className="bot-help">다시 로그인해 ‘봇 채팅’ 권한을 허용해 주세요. <a className="permission-link" href="#connection-title">권한 다시 허용하기</a></p>
                )}

                {params.chat === "sent" && params.chatMessage && (
                  <div className="sent-chat-message" aria-label="보낸 메시지">
                    <strong>보낸 메시지</strong>
                    <p>{params.chatMessage.slice(0, 200)}</p>
                  </div>
                )}
              </div>

              <p className="bot-footnote">
                봇이 나간 뒤에도 Spoon 청취자 목록에 봇이 잠시 보일 수 있습니다.
              </p>
            </article>
          )}

          {isBackupTab && connected && (
            <article className="bot-card backup-page" aria-labelledby="backup-title">
              <div className="bot-heading">
                <div>
                  <p className="section-label">로컬 보관</p>
                  <h2 id="backup-title">데이터 백업</h2>
                </div>
              </div>

              {settingsNotice && (
                <div className={`settings-notice is-${settingsNotice.tone}`} role={settingsNotice.tone === "error" ? "alert" : "status"}>
                  <span aria-hidden="true">{settingsNotice.tone === "success" ? "✓" : "!"}</span>
                  <strong>{settingsNotice.text}</strong>
                </div>
              )}

              <section className="backup-tools" aria-labelledby="backup-tools-title">
                <div>
                  <h3 id="backup-tools-title">백업 다운로드 및 복원</h3>
                  <p>로그인 정보는 백업에 포함되지 않습니다. 내려받은 파일은 안전한 곳에 보관해 주세요.</p>
                </div>
                <div className="backup-scope" aria-label="백업 데이터 범위">
                  <section>
                    <h4>운영 데이터</h4>
                    <ul>
                      <li>DJ 표시 이름과 자동화 문구·사용 여부·반복 간격</li>
                      <li>사용자 명령어, 카운터, 신청곡 목록</li>
                      <li>가위바위보·추첨·퀴즈 라운드와 참여 기록</li>
                      <li>룰렛 설정·경품·당첨·킵 기록</li>
                    </ul>
                  </section>
                  <section>
                    <h4>청취자 기록 추가</h4>
                    <ul>
                      <li>청취자 ID·닉네임·최초/최근 확인 시각</li>
                      <li>방송별 입장·하트·스푼 후원 이벤트</li>
                      <li>현재 방송 스푼 랭킹 스냅샷</li>
                    </ul>
                  </section>
                  <section>
                    <h4>저장하지 않음</h4>
                    <ul>
                      <li>로그인 정보, 관리자 정보</li>
                      <li>봇 입장 상태와 현재 방송 연결 상태</li>
                      <li>대시보드의 최근 활동 목록</li>
                    </ul>
                  </section>
                </div>
                <div className="backup-downloads">
                  <a href="/bot/backup">운영 데이터 다운로드</a>
                  <a href="/bot/backup?audience=1">청취자 기록 포함 다운로드</a>
                </div>
                <form action="/bot/backup" method="post" encType="multipart/form-data">
                  <label htmlFor="workspace-backup-file">백업 파일</label>
                  <input id="workspace-backup-file" type="file" name="backup" accept="application/json,.json" required />
                  <label className="backup-confirm">
                    <input type="checkbox" required />
                    <span>현재 운영 데이터를 백업 파일 내용으로 교체합니다.</span>
                  </label>
                  <ConfirmButton type="submit" message="현재 운영 데이터를 백업 파일 내용으로 바꿀까요? 되돌릴 수 없습니다.">백업 복원</ConfirmButton>
                </form>
                <p className="backup-privacy">두 백업 모두 신청곡·게임·룰렛 참여 닉네임을 포함할 수 있습니다. 청취자 기록 포함 백업에는 청취자 프로필과 후원 이벤트가 추가됩니다.</p>
                <p className="backup-privacy">복원하면 운영 데이터는 백업 시점 내용으로 교체됩니다. 운영 데이터 백업만 복원할 때는 서버의 기존 청취자 기록을 유지합니다.</p>
              </section>
            </article>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
