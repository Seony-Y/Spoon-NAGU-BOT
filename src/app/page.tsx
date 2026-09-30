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

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const connected = params.status === "connected";
  const error = params.error ? errorMessages[params.error] ?? "연동에 실패했습니다." : null;

  return (
    <main className="shell">
      <section className="panel" aria-labelledby="page-title">
        <div className="brand" aria-hidden="true">N</div>
        <p className="eyebrow">SPOON LIVE ASSISTANT</p>
        <h1 id="page-title">NAGU BOT</h1>
        <p className="summary">방송 운영을 위한 안전한 계정 연결</p>

        {connected && (
          <div className="notice success" role="status">
            <strong>연결 완료</strong>
            <span>{params.scope || "권한이 정상적으로 승인되었습니다."}</span>
          </div>
        )}

        {error && (
          <div className="notice error" role="alert">
            <strong>연결 실패</strong>
            <span>{error}</span>
          </div>
        )}

        <a className="connect" href="/oauth/connect">
          {connected ? "다시 연결" : "Spoon 계정 연결"}
        </a>

        <p className="privacy">인증 정보는 암호화된 보안 쿠키에만 저장됩니다.</p>
      </section>
    </main>
  );
}
