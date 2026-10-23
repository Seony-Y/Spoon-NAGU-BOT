import { MAX_RAFFLE_WINNERS } from "@/lib/dj-command";
import { AutoRefresh } from "../refresh-live-button";
import { formatDateTime } from "./format";
import { CommandGuide } from "./command-guide";
import type { DashboardView } from "./load";

export function RafflePanel({ view }: { view: DashboardView }) {
  const { params, scopes, bot, hasChatScope, raffleRound, raffleHistory } = view;
  if (!bot) return null;
  return (
    <section className="game-panel" aria-labelledby="raffle-title">
      {raffleRound?.active && <AutoRefresh intervalMs={2000} />}
      <div className="game-panel-heading">
        <div>
          <h3 id="raffle-title">추첨</h3>
          <p>당첨 인원을 정해 시작하면 청취자가 방송 채팅에서 <code>!참여</code>로 한 번 참여할 수 있습니다.</p>
        </div>
        <span className={`game-state ${raffleRound?.active ? "is-active" : ""}`}>
          {raffleRound?.active ? "진행 중" : "대기"}
        </span>
      </div>

      {params.raffle === "started" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>추첨을 시작했습니다.</strong></div>}
      {params.raffle === "finished" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>당첨자를 확정하고 방송 채팅에 공개했습니다.</strong></div>}
      {params.raffle === "already_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 추첨을 먼저 종료해 주세요.</strong></div>}
      {params.raffle === "not_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 추첨이 없습니다.</strong></div>}
      {params.raffle === "invalid_winner_count" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>당첨 인원은 1명 이상 {MAX_RAFFLE_WINNERS.toLocaleString("ko-KR")}명 이하의 정수로 입력해 주세요.</strong></div>}
      {params.raffle === "not_live" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>방송이 시작된 뒤 시작해 주세요.</strong></div>}
      {params.raffle === "bot_required" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>봇을 방송에 입장시킨 뒤 시작해 주세요.</strong></div>}
      {params.raffle === "missing_scope" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>채팅 이벤트와 전송 권한이 필요합니다.</strong></div>}

      {raffleRound?.active ? (
        <div className="rps-active-round">
          <div className="rps-round-number">
            <span>라운드</span>
            <strong>#{raffleRound.roundId} · 최대 {raffleRound.winnerCount}명 당첨</strong>
          </div>
          <div className="rps-live-count" role="status" aria-live="polite" aria-atomic="true">
            <span>실시간 참여자</span>
            <strong>{raffleRound.entries.length.toLocaleString("ko-KR")}<small>명</small></strong>
          </div>
          <form action="/game/raffle" method="post">
            <input type="hidden" name="action" value="finish" />
            <button className="rps-finish" type="submit">추첨 종료 및 당첨자 공개</button>
          </form>
        </div>
      ) : (
        <form className="rps-start-form raffle-start-form" action="/game/raffle" method="post">
          <input type="hidden" name="action" value="start" />
          <fieldset disabled={!bot.enabled || !hasChatScope || !scopes.includes("events.chat")}>
            <legend>당첨 인원</legend>
            <label className="raffle-winner-count">
              <input type="number" name="winnerCount" min={1} max={MAX_RAFFLE_WINNERS} step={1} defaultValue={1} required />
              <span>명</span>
            </label>
            <button type="submit">추첨 시작</button>
          </fieldset>
        </form>
      )}

      {raffleHistory.length > 0 && (
        <section className="rps-history" aria-labelledby="raffle-history-title">
          <div className="rps-history-heading">
            <h4 id="raffle-history-title">추첨 기록</h4>
            <span>최근 {raffleHistory.length}개</span>
          </div>
          {raffleHistory.map((round, index) => {
            const winnerTotal = round.entries.filter((entry) => entry.winner).length;
            return (
              <details className="rps-history-round" key={round.roundId} open={index === 0}>
                <summary>
                  <span><strong>라운드 #{round.roundId}</strong><small>{formatDateTime(round.endedAt ?? round.startedAt)}</small></span>
                  <span>당첨 {winnerTotal}명</span>
                  <span>참여 {round.entries.length}명 · 설정 {round.winnerCount}명</span>
                </summary>
                {round.entries.length > 0 ? (
                  <ol>
                    {round.entries.map((entry) => (
                      <li key={entry.userId}>
                        <strong>{entry.nickname}</strong>
                        <span>참여</span>
                        <em className={entry.winner ? "is-win" : ""}>{entry.winner ? "당첨" : "미당첨"}</em>
                      </li>
                    ))}
                  </ol>
                ) : <p>참가자가 없는 라운드입니다.</p>}
              </details>
            );
          })}
        </section>
      )}

      <CommandGuide rows={[
        { who: "청취자", commands: [{ command: "!참여", description: "응모" }] },
        { who: "DJ", commands: [{ command: "!추첨 시작 3", description: "당첨 3명" }, { command: "!추첨 종료" }] },
      ]} />
    </section>
  );
}
