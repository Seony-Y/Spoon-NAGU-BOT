import Image from "next/image";
import Link from "next/link";
import naguBot from "@/asset/NaGuBot.png";
import { ClearStatusParams } from "./clear-status-params";
import { ConfirmButton } from "./confirm-button";
import { AudienceCard } from "./dashboard/audience-card";
import { BackupCard } from "./dashboard/backup-card";
import { BotCard } from "./dashboard/bot-card";
import { GameCard } from "./dashboard/game-card";
import { scopeLabels, scopeOrder, botStateLabels } from "./dashboard/labels";
import { LiveCard } from "./dashboard/live-card";
import { loadDashboardView, type DashboardSearchParams } from "./dashboard/load";
import { RecentEventsCard } from "./dashboard/recent-events-card";
import { OAuthLoginGate } from "./oauth-login-gate";
import { SiteFooter, SiteHeader } from "./site-chrome";

type HomeProps = {
  searchParams: Promise<DashboardSearchParams>;
};

export default async function Home({ searchParams }: HomeProps) {
  const view = await loadDashboardView(await searchParams);
  const { isBotTab, isGameTab, isBackupTab, isDashboardTab, connectionBlocked, connected, connectionError, scopes, missingRequiredScopes, allScopesRequired, disconnected, liveStatus, bot, hasEventScope, workspaceLinked } = view;
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
                {[...scopes]
                  .sort((left, right) => (scopeOrder.indexOf(left) + 1 || 99) - (scopeOrder.indexOf(right) + 1 || 99))
                  .map((scope) => (
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
              <Link className="bot-bar-link" href="/remote">📱 휴대폰 리모컨</Link>
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

          {isDashboardTab && connected && liveStatus && <LiveCard view={view} />}

          {isDashboardTab && connected && <AudienceCard view={view} />}

          {isDashboardTab && connected && bot && <RecentEventsCard view={view} />}

          {isGameTab && connected && bot && <GameCard view={view} />}

          {isBotTab && connected && bot && <BotCard view={view} />}

          {isBackupTab && connected && <BackupCard view={view} />}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
