import { RefreshButton } from "../refresh-live-button";
import { formatDateTime, summarizeEvent } from "./format";
import { scopeLabels } from "./labels";
import type { DashboardView } from "./load";

export function RecentEventsCard({ view }: { view: DashboardView }) {
  const { bot } = view;
  if (!bot) return null;
  return (
    <article className="event-card" aria-labelledby="recent-events-title">
      <div className="event-feed">
        <div className="event-feed-heading">
          <div>
            <p className="section-label">방송 활동</p>
            <h2 id="recent-events-title">최근 활동</h2>
          </div>
          <RefreshButton label="이벤트" />
        </div>
        {bot.events.length > 0 ? (
          <ol>
            {bot.events.map((event, index) => (
              <li key={event.id ?? `${event.receivedAt}-${index}`}>
                <span className={`event-type is-${event.type}`}>
                  {scopeLabels[`events.${event.type}`]}
                </span>
                <p>{summarizeEvent(event)}</p>
                <time dateTime={event.receivedAt}>{formatDateTime(event.receivedAt)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <p className="event-empty">아직 들어온 입장·채팅·하트·후원이 없습니다.</p>
        )}
      </div>
    </article>
  );
}
