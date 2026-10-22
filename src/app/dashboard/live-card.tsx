import { RefreshLiveButton } from "../refresh-live-button";
import { formatDateTime } from "./format";
import type { DashboardView } from "./load";

export function LiveCard({ view }: { view: DashboardView }) {
  const { liveStatus } = view;
  if (!liveStatus) return null;
  return (
    <article className="live-card" aria-labelledby="live-title">
      <div className="live-heading">
        <div>
          <p className="section-label">방송 상태</p>
          <div className="live-title-row">
            <h2 id="live-title">
              {liveStatus.kind === "live" ? liveStatus.live.title : "현재 방송 정보"}
            </h2>
            <RefreshLiveButton />
          </div>
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
                {liveStatus.live.isChatFrozen ? "채팅 잠김" : "채팅 가능"}
              </dd>
            </div>
          </dl>

          {liveStatus.live.welcomeMessage && (
            <div className="live-message">
              <span>Spoon 방송 인사말 · 읽기 전용</span>
              <p>{liveStatus.live.welcomeMessage}</p>
            </div>
          )}

          {(liveStatus.live.categories.length > 0 || liveStatus.live.tags.length > 0) && (
            <div className="live-tags" aria-label="방송 카테고리와 태그">
              {liveStatus.live.categories.map((category) => (
                <span key={`category-${category}`}>{category === "iteconomy" ? "태그" : category}</span>
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
        <div className="notice info" role="status">
          <span className="notice-icon" aria-hidden="true">i</span>
          <div>
            <strong>방송 정보가 표시되지 않습니다</strong>
            <span>‘방송 정보’ 권한이 없어 표시할 수 없습니다. <a className="permission-link" href="#connection-title">권한 다시 허용하기</a></span>
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

    </article>
  );
}
