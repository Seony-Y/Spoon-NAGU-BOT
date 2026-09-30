"use client";

import { type FormEvent, useState } from "react";

type AdminSession = {
  sessionKey: string;
  djNickname: string;
  botEnabled: boolean;
  blocked: boolean;
  updatedAt: number;
};

type AdminConsoleProps = {
  configured: boolean;
};

const formatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export function AdminConsole({ configured }: AdminConsoleProps) {
  const [password, setPassword] = useState("");
  const [sessions, setSessions] = useState<AdminSession[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(mode: "list" | "block" | "unblock", sessionKey = "") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ password, mode, sessionKey }),
      });
      if (!response.ok) {
        setSessions(null);
        setError(response.status === 401 ? "관리자 코드가 올바르지 않습니다." : "요청을 처리하지 못했습니다.");
        return;
      }
      const body = await response.json() as { sessions: AdminSession[] };
      setSessions(body.sessions);
    } catch {
      setError("관리자 서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void request("list");
  }

  if (!sessions) {
    return (
      <section className="admin-login" aria-labelledby="login-title">
        <h2 id="login-title">관리자 코드 입력</h2>
        <p>관리자 코드는 저장되지 않으며 새로고침하면 다시 입력해야 합니다.</p>
        {!configured && <p className="admin-error">ADMIN_PASSWORD 환경변수를 먼저 설정해 주세요.</p>}
        {error && <p className="admin-error" role="alert">{error}</p>}
        <form onSubmit={authenticate}>
          <label htmlFor="admin-password">관리자 코드</label>
          <input id="admin-password" value={password} onChange={(event) => setPassword(event.target.value)} name="password" type="password" autoComplete="off" required />
          <button type="submit" disabled={!configured || busy}>{busy ? "확인 중" : "확인"}</button>
        </form>
      </section>
    );
  }

  return (
    <section className="admin-sessions" aria-labelledby="sessions-title">
      <div className="admin-heading">
        <div>
          <h2 id="sessions-title">DJ 연결</h2>
          <p>차단하면 실행 중인 봇이 즉시 종료되고 같은 OAuth 연결의 재참여가 막힙니다.</p>
        </div>
      </div>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-table-wrap">
        <table>
          <thead><tr><th>DJ 닉네임</th><th>연결 ID</th><th>봇 상태</th><th>최근 갱신</th><th>관리</th></tr></thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.sessionKey}>
                <td><strong>{session.djNickname || "미확인"}</strong></td>
                <td><code>{session.sessionKey.slice(0, 12)}</code></td>
                <td>{session.blocked ? "차단됨" : session.botEnabled ? "참여 중" : "대기"}</td>
                <td>{formatter.format(session.updatedAt)}</td>
                <td><button disabled={busy} className={session.blocked ? "admin-unblock" : "admin-block"} type="button" onClick={() => void request(session.blocked ? "unblock" : "block", session.sessionKey)}>{session.blocked ? "차단 해제" : "차단"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}