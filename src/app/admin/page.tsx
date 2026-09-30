import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import naguBotLogo from "@/asset/NAGU-BOT-LOGO.png";
import { ADMIN_COOKIE, isAdminConfigured, verifyAdminToken } from "@/lib/admin-auth";
import { listAdminSessions } from "@/lib/session-store";

type AdminProps = {
  searchParams: Promise<{ error?: string; status?: string }>;
};

const formatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

export default async function AdminPage({ searchParams }: AdminProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const authenticated = verifyAdminToken(cookieStore.get(ADMIN_COOKIE)?.value);

  return (
    <div className="site-shell admin-shell">
      <header className="header">
        <Link className="wordmark" href="/" aria-label="NAGU BOT 홈">
          <Image className="wordmark-symbol" src={naguBotLogo} alt="" aria-hidden="true" sizes="34px" />
          <span>NAGU BOT</span>
        </Link>
        <span className="header-status">관리자 모드</span>
      </header>

      <main className="admin-main">
        <p className="section-label">ADMINISTRATION</p>
        <h1>연결 관리</h1>

        {!authenticated ? (
          <section className="admin-login" aria-labelledby="login-title">
            <h2 id="login-title">관리자 인증</h2>
            {!isAdminConfigured() && <p className="admin-error">ADMIN_PASSWORD 환경변수를 먼저 설정해 주세요.</p>}
            {params.error && <p className="admin-error">관리자 인증에 실패했습니다.</p>}
            <form action="/admin/login" method="post">
              <label htmlFor="admin-password">관리자 비밀번호</label>
              <input id="admin-password" name="password" type="password" autoComplete="current-password" required />
              <button type="submit" disabled={!isAdminConfigured()}>로그인</button>
            </form>
          </section>
        ) : (
          <section className="admin-sessions" aria-labelledby="sessions-title">
            <div className="admin-heading">
              <div>
                <h2 id="sessions-title">DJ 연결</h2>
                <p>차단하면 실행 중인 봇이 즉시 종료되고 같은 OAuth 연결의 재참여가 막힙니다.</p>
              </div>
              <form action="/admin/logout" method="post"><button type="submit">로그아웃</button></form>
            </div>

            {params.status && <p className="admin-success">연결 상태를 변경했습니다.</p>}
            {params.error && <p className="admin-error">요청을 처리하지 못했습니다.</p>}

            <div className="admin-table-wrap">
              <table>
                <thead><tr><th>연결 ID</th><th>봇 상태</th><th>최근 갱신</th><th>관리</th></tr></thead>
                <tbody>
                  {listAdminSessions().map((session) => (
                    <tr key={session.sessionKey}>
                      <td><code>{session.sessionKey.slice(0, 12)}</code></td>
                      <td>{session.blocked ? "차단됨" : session.botEnabled ? "참여 중" : "대기"}</td>
                      <td>{formatter.format(session.updatedAt)}</td>
                      <td>
                        <form action="/admin/session" method="post">
                          <input type="hidden" name="sessionKey" value={session.sessionKey} />
                          <input type="hidden" name="mode" value={session.blocked ? "unblock" : "block"} />
                          <button className={session.blocked ? "admin-unblock" : "admin-block"} type="submit">
                            {session.blocked ? "차단 해제" : "차단"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}