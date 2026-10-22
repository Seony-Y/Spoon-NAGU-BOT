"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="error-page">
      <h1>화면을 불러오지 못했습니다.</h1>
      <p>Spoon 서버가 잠시 응답하지 않거나 일시적인 문제가 생겼습니다. 방송 중인 봇은 계속 동작합니다.</p>
      <div className="error-page-actions">
        <button type="button" onClick={() => retry()}>다시 시도</button>
        <Link href="/">처음 화면으로</Link>
      </div>
      {error.digest && <small>오류 번호: {error.digest}</small>}
    </main>
  );
}
