import { ConfirmButton } from "../confirm-button";
import { AutomationSettings } from "./automation-settings";
import { botStateLabels, FOLLOW_NOTICES } from "./labels";
import type { DashboardView } from "./load";

export function BotCard({ view }: { view: DashboardView }) {
  const { params, scopes, bot, hasEventScope, hasChatScope, chatNotice, botSettings } = view;
  if (!bot) return null;
  return (
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

      {botSettings && <AutomationSettings view={view} />}

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
  );
}
