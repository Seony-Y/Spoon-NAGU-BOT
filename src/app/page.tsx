import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import naguBotLogo from "@/asset/NAGU-BOT-LOGO.png";
import naguBot from "@/asset/NaGuBot.png";
import { getAuthSession } from "@/lib/auth";
import { loadAudienceStatus } from "@/lib/audience";
import { getBotSnapshot, type BotConnectionState, type BotEvent } from "@/lib/bot-runtime";
import { loadLiveStatus } from "@/lib/live";
import { SESSION_COOKIE } from "@/lib/session";
import { getBotSettings, isSessionBlocked, listBotCommands, listBotCounters } from "@/lib/session-store";
import { RefreshLiveButton } from "./refresh-live-button";

type HomeProps = {
  searchParams: Promise<{
    status?: string;
    error?: string;
    bot?: string;
    chat?: string;
    settings?: string;
    tab?: string;
    automation?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  access_denied: "연동 요청이 취소되었습니다.",
  invalid_scope: "등록되지 않은 권한이 요청되었습니다.",
  missing_code: "인증 코드가 전달되지 않았습니다.",
  state_mismatch: "요청 검증에 실패했습니다. 다시 시작해 주세요.",
  token_exchange_failed: "토큰 발급에 실패했습니다. 설정을 확인해 주세요.",
  disconnect_failed: "연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  authentication_required: "인증이 만료되었습니다. Spoon 계정을 다시 연결해 주세요.",
  events_scope_required: "실시간 이벤트 권한을 먼저 승인해 주세요.",
  bot_start_failed: "봇 참여를 시작하지 못했습니다. 다시 시도해 주세요.",
  account_blocked: "관리자가 이 DJ 연결을 차단했습니다.",
  server_configuration: "서버 환경 변수가 아직 준비되지 않았습니다.",
};

const scopeLabels: Record<string, string> = {
  "live.read": "방송 정보",
  "events.chat": "실시간 채팅",
  "events.presence": "청취자 입장",
  "events.like": "좋아요",
  "events.donation": "후원 내역",
  "chat.send": "봇 채팅",
  "listeners.read": "청취자 목록",
  "fans.read": "팬 랭킹",
};

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

const botStateLabels: Record<BotConnectionState, string> = {
  stopped: "퇴장",
  starting: "시작 중",
  waiting: "방송 대기",
  connecting: "연결 중",
  connected: "참여 중",
  reconnecting: "재연결 중",
  authentication_required: "재연결 필요",
  permission_required: "권한 필요",
  blocked: "입장 차단",
  error: "연결 오류",
};

const chatNotices: Record<string, { tone: "success" | "error"; title: string; detail: string }> = {
  sent: { tone: "success", title: "채팅 전송 완료", detail: "Spoon 방송 채팅에 메시지를 보냈습니다." },
  invalid_message: { tone: "error", title: "메시지를 입력해 주세요", detail: "공백만 있는 메시지는 보낼 수 없습니다." },
  message_too_long: { tone: "error", title: "메시지가 너무 깁니다", detail: "채팅은 UTF-16 기준 200자까지 보낼 수 있습니다." },
  authentication_required: { tone: "error", title: "계정 재연결 필요", detail: "Spoon 인증이 만료되었습니다." },
  missing_scope: { tone: "error", title: "채팅 권한 필요", detail: "계정을 다시 연결해 chat.send 권한을 승인해 주세요." },
  chat_blocked: { tone: "error", title: "채팅 전송 제한", detail: "채팅이 동결됐거나 봇이 채팅 금지 상태입니다." },
  bot_blocked: { tone: "error", title: "방송 입장 차단", detail: "DJ가 Spoon에서 봇 차단 상태를 확인해야 합니다." },
  offline: { tone: "error", title: "방송 전입니다", detail: "방송을 시작한 뒤 다시 보내 주세요." },
  rate_limited: { tone: "error", title: "채팅이 혼잡합니다", detail: "잠시 기다린 뒤 다시 보내 주세요." },
  unavailable: { tone: "error", title: "채팅 전송 실패", detail: "일시적인 오류입니다. 잠시 후 다시 시도해 주세요." },
};

const settingsNotices: Record<string, { tone: "success" | "error"; text: string }> = {
  greeting_sent: { tone: "success", text: "인사말을 저장하고 현재 방송 채팅에 바로 보냈습니다." },
  feature_saved: { tone: "success", text: "자동화 설정을 저장했습니다. 다음 이벤트부터 적용됩니다." },
  command_saved: { tone: "success", text: "명령어를 저장했습니다. 같은 명령어는 새 응답으로 교체됩니다." },
  command_deleted: { tone: "success", text: "명령어를 삭제했습니다." },
  invalid_greeting: { tone: "error", text: "인사말은 1자 이상 200자 이하로 입력해 주세요." },
  invalid_nickname: { tone: "error", text: "DJ 닉네임은 1자 이상 50자 이하로 입력해 주세요." },
  invalid_command: { tone: "error", text: "명령어는 !로 시작해 20자 이하, 응답은 200자 이하로 입력해 주세요." },
  invalid_message: { tone: "error", text: "메시지는 1자 이상 200자 이하로 입력해 주세요." },
  invalid_interval: { tone: "error", text: "반복 간격은 1분 이상 1440분 이하로 입력해 주세요." },
  counter_saved: { tone: "success", text: "실드 설정을 저장했습니다." },
  counter_reset: { tone: "success", text: "현재 개수를 초기 개수로 되돌렸습니다." },
  counter_deleted: { tone: "success", text: "실드 설정을 삭제했습니다." },
  counter_conflict: { tone: "error", text: "같은 이름의 실드 설정이 이미 있습니다." },
  invalid_counter: { tone: "error", text: "이름은 공백 없이 20자 이하, 개수는 0~1,000,000으로 입력해 주세요." },
};

const automationTabs = [
  ["ranking", "실시간 랭킹"],
  ["welcome", "입장 환영"],
  ["donation", "후원 감사"],
  ["heart", "하트 후원"],
  ["repeat", "반복 멘트"],
  ["counters", "실드 설정"],
  ["commands", "채팅 명령어"],
] as const;

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
  }
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const isBotTab = params.tab === "bot";
  const automationTab = automationTabs.some(([key]) => key === params.automation)
    ? params.automation
    : "ranking";
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  const connectionBlocked = isSessionBlocked(sessionId);
  let session = await getAuthSession(sessionId);
  const liveResult = await loadLiveStatus(sessionId, session);
  session = liveResult.session;
  const audienceResult = await loadAudienceStatus(sessionId, session);
  session = audienceResult.session;
  const connected = session !== null;
  const error = params.error
    ? errorMessages[params.error] ?? "연동에 실패했습니다."
    : liveResult.authenticationExpired || audienceResult.authenticationExpired
      ? "인증이 만료되었습니다. Spoon 계정을 다시 연결해 주세요."
      : null;
  const connectionError = connectionBlocked ? errorMessages.account_blocked : error;
  const scopes = session?.scope.split(" ").filter(Boolean) ?? [];
  const disconnected = params.status === "disconnected";
  const liveStatus = liveResult.status;
  const bot = connected && sessionId ? getBotSnapshot(sessionId) : null;
  const hasEventScope = scopes.some((scope) => scope.startsWith("events."));
  const hasChatScope = scopes.includes("chat.send");
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

  return (
    <div className="site-shell">
      <header className="header">
        <Link className="wordmark" href="/" aria-label="NAGU BOT 홈">
          <Image
            className="wordmark-symbol"
            src={naguBotLogo}
            alt=""
            aria-hidden="true"
            sizes="34px"
          />
          <span>NAGU BOT</span>
        </Link>
        <span className={`header-status ${connected ? "is-connected" : ""}`}>
          <span className="status-dot" aria-hidden="true" />
          {connected ? "연결됨" : "연결 대기"}
        </span>
      </header>

      <main>
        {!isBotTab && <section className="hero" aria-labelledby="page-title">
          <div className="hero-inner">
            <div className="hero-copy">
              <p className="eyebrow">SPOON LIVE ASSISTANT</p>
              <h1 id="page-title">방송 운영을<br />더 편리하게</h1>
              <p className="summary">NAGU BOT이 반복 안내와 채팅 명령을 도와드려요.</p>
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
              <p className="section-label">계정 연결</p>
              <h2 id="connection-title">
                {connected
                  ? "Spoon 계정이 연결됐어요"
                  : connectionBlocked
                    ? "관리자가 연결을 차단했어요"
                    : "Spoon 계정을 연결해 주세요"}
              </h2>
              <p>
                {connected
                  ? "NAGU BOT이 승인된 권한으로 방송을 도울 준비가 됐습니다."
                  : connectionBlocked
                    ? "차단 해제 전에는 계정 재연결과 봇 참여를 사용할 수 없습니다."
                    : "방송 정보와 채팅 기능을 사용하려면 DJ 계정의 동의가 필요합니다."}
              </p>
            </div>

            {connected && (
              <div className="notice success" role="status">
                <span className="notice-icon" aria-hidden="true">✓</span>
                <div>
                  <strong>연결 완료</strong>
                  <span>승인된 권한 {scopes.length}개</span>
                </div>
              </div>
            )}

            {connectionError && (
              <div className="notice error" role="alert">
                <span className="notice-icon" aria-hidden="true">!</span>
                <div>
                  <strong>연결 실패</strong>
                  <span>{connectionError}</span>
                </div>
              </div>
            )}

            {disconnected && !connected && (
              <div className="notice success" role="status">
                <span className="notice-icon" aria-hidden="true">✓</span>
                <div>
                  <strong>연결 해제 완료</strong>
                  <span>Spoon 토큰을 안전하게 폐기했습니다.</span>
                </div>
              </div>
            )}

            {connected && scopes.length > 0 && (
              <div className="permissions" aria-label="승인된 권한">
                {scopes.map((scope) => (
                  <span key={scope}>{scopeLabels[scope] ?? scope}</span>
                ))}
              </div>
            )}

            {connected && accountSettings && (
              <form className="profile-form" action="/account/profile" method="post">
                <div>
                  <label htmlFor="account-dj-nickname">DJ 닉네임</label>
                  <span>{accountSettings.djNickname ? "연결 관리에 표시되는 이름입니다." : "계속하려면 DJ 닉네임을 등록해 주세요."}</span>
                </div>
                <input
                  id="account-dj-nickname"
                  name="djNickname"
                  defaultValue={accountSettings.djNickname}
                  maxLength={50}
                  placeholder="Spoon DJ 닉네임"
                  required
                />
                <button type="submit">{accountSettings.djNickname ? "수정" : "등록"}</button>
              </form>
            )}

            {params.status === "nickname_saved" && (
              <p className="profile-result" role="status">DJ 닉네임을 저장했습니다.</p>
            )}

            {params.status === "invalid_nickname" && (
              <p className="profile-result is-error" role="alert">DJ 닉네임은 1자 이상 50자 이하로 입력해 주세요.</p>
            )}

            {!connectionBlocked && <div className="connection-actions">
              <a className="connect" href="/oauth/connect">
                {connected ? "계정 다시 연결하기" : "Spoon 계정 연결하기"}
              </a>
              {connected && (
                <form action="/oauth/disconnect" method="post">
                  <button className="disconnect" type="submit">연결 해제</button>
                </form>
              )}
            </div>}

            <p className="privacy">
              인증 정보는 암호화되어 안전하게 보관되며 비밀번호는 저장하지 않습니다.
            </p>
          </div>

          {connected && <nav className="dashboard-tabs" aria-label="운영 메뉴">
            <Link scroll={false} className={!isBotTab ? "is-active" : ""} href="/" aria-current={!isBotTab ? "page" : undefined}>
              대시보드
            </Link>
            <Link scroll={false} className={isBotTab ? "is-active" : ""} href="/?tab=bot" aria-current={isBotTab ? "page" : undefined}>
              봇 운영
            </Link>
          </nav>}

          {!isBotTab && connected && liveStatus && (
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
                        {liveStatus.live.isChatFrozen ? "채팅 동결" : "채팅 가능"}
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
                        <span key={`category-${category}`}>{category}</span>
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
                <div className="notice error" role="alert">
                  <span className="notice-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>방송 정보 권한 필요</strong>
                    <span>계정을 다시 연결해 live.read 권한을 승인해 주세요.</span>
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

          {!isBotTab && connected && (
            <article className="audience-card" aria-labelledby="audience-title">
              <div className="audience-heading">
                <div>
                  <p className="section-label">방송 구성원</p>
                  <h2 id="audience-title">청취자와 팬 랭킹</h2>
                </div>
                <Link href="/">목록 새로고침</Link>
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
                        </li>
                      ))}
                    </ol>
                  )}
                  {audienceResult.listeners.kind === "ready" && audienceResult.listeners.items.length === 0 && (
                    <p className="audience-empty">현재 청취자가 없습니다.</p>
                  )}
                  {audienceResult.listeners.kind === "offline" && <p className="audience-empty">방송 전입니다.</p>}
                  {audienceResult.listeners.kind === "missing_scope" && (
                    <p className="audience-empty">listeners.read 권한이 필요합니다.</p>
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
                    <p className="audience-empty">fans.read 권한이 필요합니다.</p>
                  )}
                  {(audienceResult.fans.kind === "unavailable" || audienceResult.fans.kind === "unauthorized") && (
                    <p className="audience-empty">팬 랭킹을 불러오지 못했습니다.</p>
                  )}
                </section>
              </div>

              <p className="audience-footnote">목록에는 이벤트 스트림으로 입장한 봇 계정도 포함될 수 있습니다.</p>
            </article>
          )}

          {isBotTab && connected && bot && (
            <article className="bot-card" aria-labelledby="bot-title">
              <div className="bot-heading">
                <div>
                  <p className="section-label">봇 운영</p>
                  <h2 id="bot-title">방송 참여 제어</h2>
                </div>
                <span className={`bot-badge is-${bot.state}`}>
                  <span className="status-dot" aria-hidden="true" />
                  {botStateLabels[bot.state]}
                </span>
              </div>

              <p className="bot-description">
                {bot.enabled
                  ? bot.state === "waiting"
                    ? "방송이 시작되면 NAGU BOT이 자동으로 참여합니다."
                    : "NAGU BOT이 실시간 이벤트 스트림을 유지하고 있습니다."
                  : "참여를 누르면 방송에 입장해 채팅·입장·하트·후원 이벤트를 받습니다."}
              </p>

              {botSettings && (
                <section className="automation-settings" aria-labelledby="automation-title">
                  <div className="automation-heading">
                    <div>
                      <p className="section-label">운영 설정</p>
                      <h3 id="automation-title">자동화와 실시간 랭킹</h3>
                    </div>
                    <span>수정 즉시 적용</span>
                  </div>

                  {settingsNotice && (
                    <div className={`settings-notice is-${settingsNotice.tone}`} role={settingsNotice.tone === "error" ? "alert" : "status"}>
                      <span aria-hidden="true">{settingsNotice.tone === "success" ? "✓" : "!"}</span>
                      <strong>{settingsNotice.text}</strong>
                    </div>
                  )}

                  <nav className="automation-tabs" aria-label="자동화 설정">
                    {automationTabs.map(([key, label]) => (
                      <Link scroll={false} key={key} className={automationTab === key ? "is-active" : ""} href={`/?tab=bot&automation=${key}`}>
                        {label}
                      </Link>
                    ))}
                  </nav>

                  {automationTab === "ranking" && (
                    <div className="ranking-columns">
                      <section>
                        <h4>애청온도 랭킹</h4>
                        {bot.favoriteRanking.length > 0 ? (
                          <ol>{bot.favoriteRanking.map((listener, index) => (
                            <li key={listener.id}><span>{index + 1}</span><strong>{listener.nickname}</strong><em>{listener.favoriteTemperature.toFixed(1)}°</em></li>
                          ))}</ol>
                        ) : <p>이번 방송에서 수신한 입장 정보가 없습니다.</p>}
                      </section>
                      <section>
                        <h4>스푼 랭킹</h4>
                        {audienceResult.fans.kind === "ready" && audienceResult.fans.items.length > 0 ? (
                          <ol>{audienceResult.fans.items.slice(0, 10).map((fan) => (
                            <li key={fan.id}><span>{fan.rank}</span><strong>{fan.nickname}</strong><em>{(fan.spoonCount ?? 0).toLocaleString("ko-KR")}스푼</em></li>
                          ))}</ol>
                        ) : <p>현재 표시할 스푼 랭킹이 없습니다.</p>}
                      </section>
                    </div>
                  )}

                  {automationTab === "welcome" && (
                    <form className="automation-feature-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="welcome" />
                      <label className="feature-enabled"><input type="checkbox" name="enabled" defaultChecked={botSettings.welcomeEnabled} /> 입장 환영 사용</label>
                      <label htmlFor="welcome-message">입장 인사말</label>
                      <textarea id="welcome-message" name="message" defaultValue={botSettings.greetingMessage} maxLength={200} rows={3} required />
                      <p><code>{"{name}"}</code>은 DJ, <code>{"{nickname}"}</code>은 청취자 닉네임입니다.</p><button type="submit">입장 환영 저장</button>
                    </form>
                  )}

                  {automationTab === "donation" && (
                    <form className="automation-feature-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="donation" />
                      <label className="feature-enabled"><input type="checkbox" name="enabled" defaultChecked={botSettings.donationEnabled} /> 후원 감사 사용</label>
                      <label htmlFor="donation-message">후원 감사말</label>
                      <textarea id="donation-message" name="message" defaultValue={botSettings.donationMessage} maxLength={200} rows={3} required />
                      <p><code>{"{nickname}"}</code>은 후원자, <code>{"{amount}"}</code>는 스푼 수입니다.</p><button type="submit">후원 감사 저장</button>
                    </form>
                  )}

                  {automationTab === "heart" && (
                    <form className="automation-feature-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="heart" />
                      <label className="feature-enabled"><input type="checkbox" name="enabled" defaultChecked={botSettings.heartEnabled} /> 하트 후원 감사 사용</label>
                      <label htmlFor="heart-message">하트 감사말</label>
                      <textarea id="heart-message" name="message" defaultValue={botSettings.heartMessage} maxLength={200} rows={3} required />
                      <p><code>{"{nickname}"}</code>은 후원자, <code>{"{milestone}"}</code>은 누적 하트 수입니다.</p><button type="submit">하트 후원 저장</button>
                    </form>
                  )}

                  {automationTab === "repeat" && (
                    <form className="automation-feature-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="repeat" />
                      <label className="feature-enabled"><input type="checkbox" name="enabled" defaultChecked={botSettings.repeatEnabled} /> 반복 멘트 사용</label>
                      <label htmlFor="repeat-interval">반복 간격</label>
                      <div className="interval-field"><input id="repeat-interval" type="number" name="intervalMinutes" min={1} max={1440} defaultValue={botSettings.repeatIntervalMinutes} required /><span>분마다</span></div>
                      <label htmlFor="repeat-message">반복 멘트</label>
                      <textarea id="repeat-message" name="message" defaultValue={botSettings.repeatMessage} maxLength={200} rows={3} required />
                      <p><code>{"{name}"}</code>을 DJ 닉네임으로 바꿉니다. 설정 변경은 1분 이내 반영됩니다.</p><button type="submit">반복 멘트 저장</button>
                    </form>
                  )}

                  {automationTab === "counters" && <div className="counter-editor">
                    <div className="counter-guide">
                      <h4>실드 개수 관리</h4>
                      <p><code>!실드 +2</code> 또는 <code>!실드 -1</code>처럼 입력하면 현재 개수가 자동 변경됩니다.</p>
                    </div>
                    {botCounters.length > 0 && <div className="counter-list">
                      {botCounters.map((counter) => <section key={counter.id} className="counter-item">
                        <form action="/bot/settings" method="post">
                          <input type="hidden" name="mode" value="save_counter" /><input type="hidden" name="id" value={counter.id} />
                          <label>이름<input name="name" defaultValue={counter.name} maxLength={20} required /></label>
                          <label>초기 개수<input type="number" name="initialValue" min={0} max={1000000} defaultValue={counter.initialValue} required /></label>
                          <label>현재 개수<input type="number" name="value" min={0} max={1000000} defaultValue={counter.value} required /></label>
                          <button type="submit">수정</button>
                        </form>
                        <div className="counter-actions">
                          <form action="/bot/settings" method="post"><input type="hidden" name="mode" value="reset_counter" /><input type="hidden" name="id" value={counter.id} /><button type="submit">초기화</button></form>
                          <form action="/bot/settings" method="post"><input type="hidden" name="mode" value="delete_counter" /><input type="hidden" name="id" value={counter.id} /><button className="is-danger" type="submit">삭제</button></form>
                        </div>
                      </section>)}
                    </div>}
                    <form className="counter-create-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="save_counter" />
                      <label htmlFor="counter-name">새 이름</label><input id="counter-name" name="name" placeholder="실드" maxLength={20} required />
                      <label htmlFor="counter-initial">초기 개수</label><input id="counter-initial" type="number" name="initialValue" min={0} max={1000000} defaultValue={0} required />
                      <button type="submit">설정 추가</button>
                    </form>
                  </div>}

                  {automationTab === "commands" && <div className="command-editor">
                    <form className="command-enabled-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="automation_feature" /><input type="hidden" name="feature" value="commands" />
                      <label><input type="checkbox" name="enabled" defaultChecked={botSettings.commandsEnabled} /> 채팅 명령어 사용</label>
                      <button type="submit">사용 설정 저장</button>
                    </form>
                    <h4>명령어 관리</h4>
                    {botCommands.length > 0 && (
                      <ul>
                        {botCommands.map((item) => (
                          <li key={item.command}>
                            <div><strong>{item.command}</strong><span>{item.response}</span></div>
                            <form action="/bot/settings" method="post">
                              <input type="hidden" name="mode" value="delete_command" />
                              <input type="hidden" name="command" value={item.command} />
                              <button type="submit" aria-label={`${item.command} 삭제`}>삭제</button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form className="command-form" action="/bot/settings" method="post">
                      <input type="hidden" name="mode" value="upsert_command" />
                      <label htmlFor="command-name">명령어</label>
                      <input id="command-name" name="command" placeholder="!공지" maxLength={20} required />
                      <label htmlFor="command-response">응답</label>
                      <input id="command-response" name="response" placeholder="응답 메시지" maxLength={200} required />
                      <button type="submit">추가 또는 수정</button>
                    </form>
                  </div>}
                </section>
              )}

              <dl className="activity-metrics">
                <div>
                  <dt>환영 인원</dt>
                  <dd>{bot.activity.welcomedListeners.toLocaleString("ko-KR")}명</dd>
                </div>
                <div>
                  <dt>누적 하트</dt>
                  <dd>{bot.activity.hearts.toLocaleString("ko-KR")}개</dd>
                </div>
                <div>
                  <dt>누적 후원</dt>
                  <dd>{bot.activity.spoons.toLocaleString("ko-KR")}스푼</dd>
                </div>
              </dl>

              {scopes.includes("events.presence") && (
                <p className="manager-help">
                  Spoon에서 봇을 매니저로 지정하면 최대 1분 이내 자동으로 반영됩니다.
                </p>
              )}

              {params.bot === "started" && bot.enabled && (
                <div className="notice success" role="status">
                  <span className="notice-icon" aria-hidden="true">✓</span>
                  <div>
                    <strong>참여 요청 완료</strong>
                    <span>방송 전이면 참여 대기 상태로 자동 연결합니다.</span>
                  </div>
                </div>
              )}

              {params.bot === "stopped" && !bot.enabled && (
                <div className="notice success" role="status">
                  <span className="notice-icon" aria-hidden="true">✓</span>
                  <div>
                    <strong>봇 퇴장 완료</strong>
                    <span>이벤트 연결을 종료했습니다.</span>
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

              {bot.state === "permission_required" && (
                <div className="notice error" role="alert">
                  <span className="notice-icon" aria-hidden="true">!</span>
                  <div>
                    <strong>이벤트 권한 필요</strong>
                    <span>계정을 다시 연결해 events 권한을 승인해 주세요.</span>
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
                <button
                  className={bot.enabled ? "bot-leave" : "bot-join"}
                  type="submit"
                  disabled={!bot.enabled && !hasEventScope}
                >
                  {bot.enabled ? "봇 퇴장" : "봇 참여"}
                </button>
              </form>

              {!hasEventScope && (
                <p className="bot-help">실시간 이벤트 권한을 승인한 뒤 참여할 수 있습니다.</p>
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
                  <p className="bot-help">계정을 다시 연결해 chat.send 권한을 승인해 주세요.</p>
                )}

                <div className="command-list" aria-label="자동 응답 명령어">
                  <span><strong>!안녕</strong> 닉네임으로 환영 인사</span>
                  <span><strong>!명령어</strong> 사용 가능한 명령어 안내</span>
                </div>
              </div>

              <div className="event-feed">
                <div className="event-feed-heading">
                  <h3>최근 이벤트</h3>
                  <Link href="/?tab=bot">상태 새로고침</Link>
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
                  <p className="event-empty">수신한 이벤트가 아직 없습니다.</p>
                )}
              </div>

              <p className="bot-footnote">
                네트워크 연결을 끊어도 Spoon의 입장 기록은 일정 시간 남을 수 있습니다.
              </p>
            </article>
          )}
        </section>
      </main>

      <footer className="footer">
        <span>NAGU BOT v1.0.0</span>
        <Link href="/admin">관리자</Link>
        <span>2026 © NAGU BOT</span>
      </footer>
    </div>
  );
}
