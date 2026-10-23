import { AutoRefresh } from "../refresh-live-button";
import { formatDateTime } from "./format";
import { CommandGuide } from "./command-guide";
import type { DashboardView } from "./load";

export function RpsPanel({ view }: { view: DashboardView }) {
  const { params, scopes, bot, hasChatScope, rpsRound, rpsHistory } = view;
  if (!bot) return null;
  return (
    <section className="game-panel" aria-labelledby="rps-title">
      {rpsRound?.active && <AutoRefresh intervalMs={2000} />}
      <div className="game-panel-heading">
        <div>
          <h3 id="rps-title">DJ vs 청취자 가위바위보</h3>
          <p>DJ가 선택한 뒤 라운드를 시작하면 청취자는 방송 채팅에서 한 번 참여할 수 있습니다. 채팅의 <code>!가위바위보 시작</code>은 DJ 선택을 랜덤으로 정합니다.</p>
        </div>
        <span className={`game-state ${rpsRound?.active ? "is-active" : ""}`}>
          {rpsRound?.active ? "진행 중" : "대기"}
        </span>
      </div>

      {params.rps === "started" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>가위바위보 라운드를 시작했습니다.</strong></div>}
      {params.rps === "finished" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>결과를 방송 채팅에 공개했습니다.</strong></div>}
      {params.rps === "already_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 라운드를 먼저 종료해 주세요.</strong></div>}
      {params.rps === "not_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 라운드가 없습니다.</strong></div>}
      {params.rps === "not_live" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>방송이 시작된 뒤 시작해 주세요.</strong></div>}
      {params.rps === "bot_required" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>봇을 방송에 입장시킨 뒤 시작해 주세요.</strong></div>}
      {params.rps === "missing_scope" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>채팅 이벤트와 전송 권한이 필요합니다.</strong></div>}

      {rpsRound?.active ? (
        <div className="rps-active-round">
          <div className="rps-round-number"><span>라운드</span><strong>#{rpsRound.roundId}</strong></div>
          <div className="rps-live-count" role="status" aria-live="polite" aria-atomic="true">
            <span>실시간 참여자</span>
            <strong>{rpsRound.entries.length.toLocaleString("ko-KR")}<small>명</small></strong>
          </div>
          <form action="/game/rps" method="post">
            <input type="hidden" name="action" value="finish" />
            <button className="rps-finish" type="submit">라운드 종료 및 결과 공개</button>
          </form>
        </div>
      ) : (
        <form className="rps-start-form" action="/game/rps" method="post">
          <input type="hidden" name="action" value="start" />
          <fieldset disabled={!bot.enabled || !hasChatScope || !scopes.includes("events.chat")}>
            <legend>DJ 선택</legend>
            <div className="rps-choice-control">
              {(["가위", "바위", "보"] as const).map((choice) => (
                <label key={choice}><input type="radio" name="choice" value={choice} required /><span>{choice}</span></label>
              ))}
              <label><input type="radio" name="choice" value="random" defaultChecked required /><span>랜덤</span></label>
            </div>
            <button type="submit">라운드 시작</button>
          </fieldset>
        </form>
      )}

      {rpsHistory.length > 0 && (
        <section className="rps-history" aria-labelledby="rps-history-title">
          <div className="rps-history-heading">
            <h4 id="rps-history-title">라운드 기록</h4>
            <span>최근 {rpsHistory.length}개</span>
          </div>
          {rpsHistory.map((round, index) => {
            const wins = round.entries.filter((entry) => entry.result === "win").length;
            const draws = round.entries.filter((entry) => entry.result === "draw").length;
            const losses = round.entries.filter((entry) => entry.result === "lose").length;
            return (
              <details className="rps-history-round" key={round.roundId} open={index === 0}>
                <summary>
                  <span><strong>라운드 #{round.roundId}</strong><small>{formatDateTime(round.endedAt ?? round.startedAt)}</small></span>
                  <span>DJ {round.djChoice}</span>
                  <span>참여 {round.entries.length}명 · 승 {wins} · 무 {draws} · 패 {losses}</span>
                </summary>
                {round.entries.length > 0 ? (
                  <ol>
                    {round.entries.map((entry) => (
                      <li key={entry.userId}>
                        <strong>{entry.nickname}</strong>
                        <span>{entry.choice}</span>
                        <em className={`is-${entry.result}`}>
                          {entry.result === "win" ? "승리" : entry.result === "draw" ? "무승부" : "패배"}
                        </em>
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
        { who: "청취자", commands: [{ command: "!가위바위보 가위" }, { command: "!가위바위보 바위" }, { command: "!가위바위보 보" }] },
        { who: "DJ", commands: [{ command: "!가위바위보 시작" }, { command: "!가위바위보 종료" }] },
      ]} />
    </section>
  );
}
