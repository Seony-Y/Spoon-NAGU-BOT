import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import naguBotLogo from "@/asset/NAGU-BOT-LOGO.png";
import naguBot from "@/asset/NaGuBot.png";
import refreshIcon from "@/asset/icon-refresh.svg";
import { getAuthSession } from "@/lib/auth";
import { getBotSnapshot, type BotConnectionState, type BotEvent } from "@/lib/bot-runtime";
import { loadLiveStatus } from "@/lib/live";
import { SESSION_COOKIE } from "@/lib/session";

type HomeProps = {
  searchParams: Promise<{
    status?: string;
    error?: string;
    bot?: string;
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
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  let session = await getAuthSession(sessionId);
  const liveResult = await loadLiveStatus(sessionId, session);
  session = liveResult.session;
  const connected = session !== null;
  const error = params.error
    ? errorMessages[params.error] ?? "연동에 실패했습니다."
    : liveResult.authenticationExpired
      ? "인증이 만료되었습니다. Spoon 계정을 다시 연결해 주세요."
      : null;
  const scopes = session?.scope.split(" ").filter(Boolean) ?? [];
  const disconnected = params.status === "disconnected";
  const liveStatus = liveResult.status;
  const bot = connected && sessionId ? getBotSnapshot(sessionId) : null;
  const hasEventScope = scopes.some((scope) => scope.startsWith("events."));

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
        <section className="hero" aria-labelledby="page-title">
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
        </section>

        <section className="connection-section" aria-labelledby="connection-title">
          <div className="connection-card">
            <div className="connection-copy">
              <p className="section-label">계정 연결</p>
              <h2 id="connection-title">
                {connected ? "Spoon 계정이 연결됐어요" : "Spoon 계정을 연결해 주세요"}
              </h2>
              <p>
                {connected
                  ? "NAGU BOT이 승인된 권한으로 방송을 도울 준비가 됐습니다."
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

            {error && (
              <div className="notice error" role="alert">
                <span className="notice-icon" aria-hidden="true">!</span>
                <div>
                  <strong>연결 실패</strong>
                  <span>{error}</span>
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

            <div className="connection-actions">
              <a className="connect" href="/oauth/connect">
                {connected ? "계정 다시 연결하기" : "Spoon 계정 연결하기"}
              </a>
              {connected && (
                <form action="/oauth/disconnect" method="post">
                  <button className="disconnect" type="submit">연결 해제</button>
                </form>
              )}
            </div>

            <p className="privacy">
              인증 정보는 암호화되어 안전하게 보관되며 비밀번호는 저장하지 않습니다.
            </p>
          </div>

          {connected && liveStatus && (
            <article className="live-card" aria-labelledby="live-title">
              <div className="live-heading">
                <div>
                  <p className="section-label">방송 상태</p>
                  <h2 id="live-title">
                    {liveStatus.kind === "live" ? liveStatus.live.title : "현재 방송 정보"}
                  </h2>
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
                      <span>방송 인사말</span>
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

              <Link className="refresh-live" href="/">
                <Image src={refreshIcon} alt="" aria-hidden="true" />
                방송 정보 새로고침
              </Link>
            </article>
          )}

          {connected && bot && (
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

              <div className="event-feed">
                <div className="event-feed-heading">
                  <h3>최근 이벤트</h3>
                  <Link href="/">상태 새로고침</Link>
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
        <span>NAGU BOT</span>
        <span>2026 © NAGU BOT</span>
      </footer>
    </div>
  );
}
