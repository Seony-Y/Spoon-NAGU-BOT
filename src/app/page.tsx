import Link from "next/link";

type HomeProps = {
  searchParams: Promise<{
    status?: string;
    error?: string;
    scope?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  access_denied: "연동 요청이 취소되었습니다.",
  invalid_scope: "등록되지 않은 권한이 요청되었습니다.",
  missing_code: "인증 코드가 전달되지 않았습니다.",
  state_mismatch: "요청 검증에 실패했습니다. 다시 시작해 주세요.",
  token_exchange_failed: "토큰 발급에 실패했습니다. 설정을 확인해 주세요.",
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

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const connected = params.status === "connected";
  const error = params.error ? errorMessages[params.error] ?? "연동에 실패했습니다." : null;
  const scopes = params.scope?.split(" ").filter(Boolean) ?? [];

  return (
    <div className="site-shell">
      <header className="header">
        <Link className="wordmark" href="/" aria-label="NAGU BOT 홈">
          <span className="wordmark-symbol" aria-hidden="true">N</span>
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
            <div className="hero-visual" role="img" aria-label="헤드폰을 쓴 Spoon 캐릭터" />
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

            {connected && scopes.length > 0 && (
              <div className="permissions" aria-label="승인된 권한">
                {scopes.map((scope) => (
                  <span key={scope}>{scopeLabels[scope] ?? scope}</span>
                ))}
              </div>
            )}

            <a className="connect" href="/oauth/connect">
              {connected ? "계정 다시 연결하기" : "Spoon 계정 연결하기"}
            </a>

            <p className="privacy">
              인증 정보는 암호화되어 안전하게 보관되며 비밀번호는 저장하지 않습니다.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>NAGU BOT</span>
        <span>2026 © NAGU BOT</span>
      </footer>
    </div>
  );
}
