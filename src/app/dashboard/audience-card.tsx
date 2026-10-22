import { RefreshButton } from "../refresh-live-button";
import type { DashboardView } from "./load";

export function AudienceCard({ view }: { view: DashboardView }) {
  const { audienceResult, bot } = view;
  return (
    <article className="audience-card" aria-labelledby="audience-title">
      <div className="audience-heading">
        <div>
          <p className="section-label">방송 구성원</p>
          <h2 id="audience-title">청취자와 팬 랭킹</h2>
        </div>
        <RefreshButton label="목록" />
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
                  {listener.subscription && <span className="subscriber-badge">구독</span>}
                </li>
              ))}
            </ol>
          )}
          {audienceResult.listeners.kind === "ready" && audienceResult.listeners.items.length === 0 && (
            <p className="audience-empty">현재 청취자가 없습니다.</p>
          )}
          {audienceResult.listeners.kind === "offline" && <p className="audience-empty">방송 전입니다.</p>}
          {audienceResult.listeners.kind === "missing_scope" && (
            <p className="audience-empty">‘청취자 목록’ 권한이 없어 표시할 수 없습니다. <a className="permission-link" href="#connection-title">권한 다시 허용하기</a></p>
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
            <p className="audience-empty">‘팬 랭킹’ 권한이 없어 표시할 수 없습니다. <a className="permission-link" href="#connection-title">권한 다시 허용하기</a></p>
          )}
          {(audienceResult.fans.kind === "unavailable" || audienceResult.fans.kind === "unauthorized") && (
            <p className="audience-empty">팬 랭킹을 불러오지 못했습니다.</p>
          )}
        </section>
      </div>

      <div className="audience-heart-summary">
        <span>받은 하트</span>
        <strong>{(bot?.activity.hearts ?? 0).toLocaleString("ko-KR")}개</strong>
        <p>봇이 입장한 뒤부터 센 하트 수입니다.</p>
      </div>

      <p className="audience-footnote">청취자 목록에 NAGU BOT 계정이 함께 보일 수 있습니다.</p>
    </article>
  );
}
