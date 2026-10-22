import { ConfirmButton } from "../confirm-button";
import { AutoRefresh } from "../refresh-live-button";
import { formatDateTime } from "./format";
import type { DashboardView } from "./load";

const NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  started: { tone: "success", text: "팀 대항전을 시작했습니다. 청취자는 !팀 (번호)로 참여합니다." },
  status_sent: { tone: "success", text: "현재 점수를 채팅에 알렸습니다." },
  finished: { tone: "success", text: "팀 대항전을 종료하고 결과를 공개했습니다." },
  settings_saved: { tone: "success", text: "팀 설정을 저장했습니다. 채팅의 !팀전 시작도 이 설정을 씁니다." },
  invalid_settings: { tone: "error", text: "팀은 2~4개, 이름은 10자 이내로 서로 다르게 입력해 주세요. 목표 점수는 0(없음) 이상입니다." },
  already_active: { tone: "error", text: "진행 중인 팀 대항전을 먼저 종료해 주세요." },
  not_active: { tone: "error", text: "진행 중인 팀 대항전이 없습니다." },
  bot_required: { tone: "error", text: "봇을 방송에 입장시킨 뒤 시작해 주세요." },
  missing_scope: { tone: "error", text: "채팅 이벤트와 전송 권한이 필요합니다." },
};

const METRIC_OPTIONS = [
  ["both", "하트 + 후원 (스푼 1개 = 10점)"],
  ["hearts", "하트만"],
  ["spoons", "후원(스푼)만"],
] as const;

export function TeamBattlePanel({ view }: { view: DashboardView }) {
  const { params, scopes, bot, hasChatScope, teamBattle, teamBattleSettings, teamBattleHistory } = view;
  if (!bot) return null;
  const notice = params.team ? NOTICES[params.team] : null;
  const canRun = bot.enabled && hasChatScope && scopes.includes("events.chat");
  const topScore = Math.max(1, ...(teamBattle?.teams.map((team) => team.score) ?? [1]));
  const teamInputs = [0, 1, 2, 3].map((index) => teamBattleSettings.teamNames[index] ?? "");
  return (
    <section className="game-panel" aria-labelledby="team-title">
      {teamBattle && <AutoRefresh intervalMs={3000} />}
      <div className="game-panel-heading">
        <div>
          <h3 id="team-title">팀 대항전</h3>
          <p>청취자가 <code>!팀 1</code>처럼 팀을 고르면, 참여 후 보낸 하트·후원이 팀 점수가 됩니다. 팀은 한 번 고르면 바꿀 수 없습니다. 선두가 바뀌면 봇이 알리고, 목표 점수를 정하면 먼저 도달한 팀이 이깁니다.</p>
        </div>
        <span className={`game-state ${teamBattle ? "is-active" : ""}`}>{teamBattle ? "진행 중" : "대기"}</span>
      </div>

      {notice && (
        <div className={`settings-notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          <span aria-hidden="true">{notice.tone === "error" ? "!" : "✓"}</span><strong>{notice.text}</strong>
        </div>
      )}

      {teamBattle ? (
        <>
          <ol className="team-scoreboard">
            {teamBattle.teams.map((team) => (
              <li key={team.index}>
                <div className="team-scoreboard-label">
                  <strong>{team.index + 1}. {team.name}</strong>
                  <span>{team.score.toLocaleString("ko-KR")}점 · {team.members.toLocaleString("ko-KR")}명</span>
                </div>
                <div className="team-scoreboard-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((team.score / topScore) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ol>
          {teamBattle.goal > 0 && <p className="team-goal">목표 {teamBattle.goal.toLocaleString("ko-KR")}점 · 먼저 도달한 팀 승리</p>}
          {teamBattle.topMembers.length > 0 && (
            <p className="team-top-members">
              기여 순위: {teamBattle.topMembers.map((member, index) => `${index + 1}. ${member.nickname}(${teamBattle.teams[member.teamIndex]?.name}) ${member.points.toLocaleString("ko-KR")}점`).join(" · ")}
            </p>
          )}
          <div className="secret-word-actions">
            <form action="/game/team-battle" method="post">
              <input type="hidden" name="action" value="status" />
              <button type="submit">채팅에 점수 알리기</button>
            </form>
            <form action="/game/team-battle" method="post">
              <input type="hidden" name="action" value="finish" />
              <ConfirmButton className="rps-finish" type="submit" message="팀 대항전을 종료하고 결과를 공개할까요?">종료하고 결과 공개</ConfirmButton>
            </form>
          </div>
        </>
      ) : (
        <form className="team-settings-form" action="/game/team-battle" method="post">
          <fieldset>
            <legend>팀 이름 (2~4개, 비워 두면 사용 안 함)</legend>
            <div className="team-name-inputs">
              {teamInputs.map((name, index) => (
                <label key={index}>{index + 1}번 팀<input name="team" defaultValue={name} maxLength={10} placeholder={index < 2 ? `${String.fromCharCode(65 + index)}팀` : "사용 안 함"} /></label>
              ))}
            </div>
          </fieldset>
          <label>점수 기준
            <select name="metric" defaultValue={teamBattleSettings.metric}>
              {METRIC_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>목표 점수 (0 = 없음)<input name="goal" type="number" min={0} max={10_000_000} step={1} defaultValue={teamBattleSettings.goal} /></label>
          <div className="quiz-queue-actions">
            <button type="submit" name="action" value="settings" className="is-secondary">설정만 저장</button>
            <button type="submit" name="action" value="start" disabled={!canRun}>이 설정으로 시작</button>
          </div>
        </form>
      )}

      {teamBattleHistory.length > 0 && (
        <section className="rps-history" aria-labelledby="team-history-title">
          <div className="rps-history-heading">
            <h4 id="team-history-title">최근 기록</h4>
            <span>최근 {teamBattleHistory.length}개</span>
          </div>
          <ol className="secret-word-history">
            {teamBattleHistory.map((battle) => (
              <li key={battle.battleId}>
                <strong>{battle.winnerIndex === null ? "무승부" : `${battle.teams[battle.winnerIndex]?.name} 승리`}</strong>
                <span>{battle.teams.map((team) => `${team.name} ${team.score.toLocaleString("ko-KR")}`).join(" : ")}{battle.topMembers[0] ? ` · MVP ${battle.topMembers[0].nickname}` : ""}</span>
                <time dateTime={new Date(battle.endedAt ?? battle.startedAt).toISOString()}>{formatDateTime(battle.endedAt ?? battle.startedAt)}</time>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="game-command">청취자: <code>!팀 1</code> <code>!팀 2</code> · DJ: <code>!팀전 시작</code> <code>!팀전 상태</code> <code>!팀전 종료</code></p>
    </section>
  );
}
