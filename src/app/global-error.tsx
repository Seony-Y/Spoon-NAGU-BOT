"use client";

// Replaces the root layout when it fails, so it cannot rely on globals.css.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f7f7f8", color: "#242424" }}>
        <title>오류 | NAGU BOT</title>
        <main style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>NAGU BOT을 불러오지 못했습니다.</h1>
          <p style={{ color: "#757575" }}>잠시 후 다시 시도해 주세요. 방송 중인 봇은 계속 동작합니다.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ minHeight: 48, padding: "0 20px", border: 0, borderRadius: 8, background: "#ff5b35", color: "#fff", fontWeight: 800, cursor: "pointer" }}
          >
            다시 시도
          </button>
          {error.digest && <p style={{ color: "#757575", fontSize: 12 }}>오류 번호: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
