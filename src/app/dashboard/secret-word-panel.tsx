import { ConfirmButton } from "../confirm-button";
import { AutoRefresh } from "../refresh-live-button";
import { formatDateTime } from "./format";
import type { DashboardView } from "./load";

const NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  started: { tone: "success", text: "비밀 단어 찾기를 시작했습니다. 채팅에는 글자 수만 알렸습니다." },
  hint_sent: { tone: "success", text: "힌트를 채팅에 공개했습니다." },
  finished: { tone: "success", text: "라운드를 종료하고 비밀 단어를 공개했습니다." },
  queued: { tone: "success", text: "대기 목록에 추가했습니다. 방송 중 !비밀단어 시작으로 위에서부터 진행됩니다." },
  queue_deleted: { tone: "success", text: "대기 단어를 삭제했습니다." },
  queue_full: { tone: "error", text: "대기 단어는 최대 30개까지 등록할 수 있습니다." },
  invalid_word: { tone: "error", text: "단어는 1~20글자(띄어쓰기·기호 제외), 힌트는 100자까지 입력해 주세요." },
  secret_queue_empty: { tone: "error", text: "등록된 대기 단어가 없습니다." },
  already_active: { tone: "error", text: "진행 중인 라운드를 먼저 종료해 주세요." },
  not_active: { tone: "error", text: "진행 중인 라운드가 없습니다." },
  bot_required: { tone: "error", text: "봇을 방송에 입장시킨 뒤 시작해 주세요." },
  not_live: { tone: "error", text: "방송이 시작된 뒤 시작해 주세요." },
  missing_scope: { tone: "error", text: "채팅 이벤트와 전송 권한이 필요합니다." },
};

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

export function SecretWordPanel({ view }: { view: DashboardView }) {
  const { params, scopes, bot, hasChatScope, secretWordQueue, secretWordRound, secretWordHistory } = view;
  if (!bot) return null;
  const notice = params.secret ? NOTICES[params.secret] : null;
  const canRun = bot.enabled && hasChatScope && scopes.includes("events.chat");
  return (
    <section className="game-panel" aria-labelledby="secret-title">
      {secretWordRound && <AutoRefresh intervalMs={2000} />}
      <div className="game-panel-heading">
        <div>
          <h3 id="secret-title">비밀 단어 찾기</h3>
          <p>미리 정해 둔 단어를 청취자가 채팅 중에 먼저 말하면 이깁니다. 명령어 없이 평소 대화가 그대로 게임이 되고, 띄어쓰기·기호·대소문자는 무시합니다. DJ의 채팅은 판정하지 않습니다.</p>
        </div>
        <span className={`game-state ${secretWordRound ? "is-active" : ""}`}>{secretWordRound ? "진행 중" : "대기"}</span>
      </div>

      {notice && (
        <div className={`settings-notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          <span aria-hidden="true">{notice.tone === "error" ? "!" : "✓"}</span><strong>{notice.text}</strong>
        </div>
      )}

      {secretWordRound ? (
        <div className="rps-active-round">
          <div className="rps-round-number">
            <span>라운드 #{secretWordRound.roundId}</span>
            <strong>{secretWordRound.word}</strong>
            <small>{secretWordRound.hint ? `힌트: ${secretWordRound.hint}` : "힌트 없음"} · 이 화면에만 보입니다</small>
          </div>
          <div className="secret-word-actions">
            <form action="/game/secret-word" method="post">
              <input type="hidden" name="action" value="hint" />
              <button type="submit" disabled={!secretWordRound.hint}>힌트 공개</button>
            </form>
            <form action="/game/secret-word" method="post">
              <input type="hidden" name="action" value="finish" />
              <ConfirmButton className="rps-finish" type="submit" message="아무도 찾지 못한 채 종료하고 비밀 단어를 공개할까요?">종료하고 정답 공개</ConfirmButton>
            </form>
          </div>
        </div>
      ) : (
        secretWordQueue.length > 0 && (
          <form action="/game/secret-word" method="post">
            <input type="hidden" name="action" value="start" />
            <button className="secret-word-start" type="submit" disabled={!canRun}>다음 단어로 시작</button>
          </form>
        )
      )}

      <section className="rps-history quiz-queue" aria-labelledby="secret-queue-title">
        <div className="rps-history-heading">
          <h4 id="secret-queue-title">대기 단어</h4>
          <span>방송 전에 등록해 두면 채팅의 <code>!비밀단어 시작</code>으로 위에서부터 진행됩니다. 단어는 채팅에 노출되지 않습니다.</span>
        </div>
        {secretWordQueue.length > 0 ? (
          <ol>
            {secretWordQueue.map((item) => (
              <li key={item.id}>
                <strong>{item.word}</strong>
                <span>{item.hint ? `힌트: ${item.hint}` : "힌트 없음"}</span>
                <form action="/game/secret-word" method="post">
                  <input type="hidden" name="action" value="queue_delete" />
                  <input type="hidden" name="id" value={item.id} />
                  <ConfirmButton className="is-danger" type="submit" message="이 대기 단어를 삭제할까요?">삭제</ConfirmButton>
                </form>
              </li>
            ))}
          </ol>
        ) : <p>등록된 대기 단어가 없습니다.</p>}
        <form className="quiz-queue-form" action="/game/secret-word" method="post">
          <input type="hidden" name="action" value="queue_add" />
          <label>비밀 단어<input name="word" maxLength={30} placeholder="고구마" required /></label>
          <label>힌트 (선택)<input name="hint" maxLength={100} placeholder="겨울 간식" /></label>
          <div className="quiz-queue-actions">
            <button type="submit">대기 목록에 추가</button>
          </div>
        </form>
      </section>

      {secretWordHistory.length > 0 && (
        <section className="rps-history" aria-labelledby="secret-history-title">
          <div className="rps-history-heading">
            <h4 id="secret-history-title">최근 기록</h4>
            <span>최근 {secretWordHistory.length}개</span>
          </div>
          <ol className="secret-word-history">
            {secretWordHistory.map((round) => (
              <li key={round.roundId}>
                <strong>{round.word}</strong>
                <span>{round.winnerNickname ? `${round.winnerNickname}님 · ${formatDuration((round.foundAt ?? round.startedAt) - round.startedAt)} 만에` : "찾은 사람 없음"}</span>
                <time dateTime={new Date(round.endedAt ?? round.startedAt).toISOString()}>{formatDateTime(round.endedAt ?? round.startedAt)}</time>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="game-command">청취자는 평소처럼 채팅하면 됩니다 · DJ: <code>!비밀단어 시작</code> <code>!비밀단어 힌트</code> <code>!비밀단어 종료</code></p>
    </section>
  );
}
