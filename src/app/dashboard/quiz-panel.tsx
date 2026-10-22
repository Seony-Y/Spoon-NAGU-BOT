import { ConfirmButton } from "../confirm-button";
import { AutoRefresh } from "../refresh-live-button";
import { formatDateTime, formatElapsedTime, getFirstCorrectAt } from "./format";
import type { DashboardView } from "./load";

export function QuizPanel({ view }: { view: DashboardView }) {
  const { params, scopes, bot, hasChatScope, quizRound, quizHistory, quizQueue } = view;
  if (!bot) return null;
  return (
    <section className="game-panel" aria-labelledby="quiz-title">
      {quizRound?.active && <AutoRefresh intervalMs={2000} />}
      <div className="game-panel-heading">
        <div>
          <h3 id="quiz-title">퀴즈</h3>
          <p>청취자가 <code>!정답 (답)</code>으로 답을 내면 가장 먼저 맞힌 사람을 자동으로 찾아 줍니다.</p>
        </div>
        <span className={`game-state ${quizRound?.active ? "is-active" : ""}`}>
          {quizRound?.active ? "진행 중" : "대기"}
        </span>
      </div>

      {params.quiz === "started" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>퀴즈 문제를 방송 채팅에 공개했습니다.</strong></div>}
      {params.quiz === "finished" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>퀴즈를 종료하고 정답을 공개했습니다.</strong></div>}
      {params.quiz === "already_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 퀴즈를 먼저 종료해 주세요.</strong></div>}
      {params.quiz === "not_active" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>진행 중인 퀴즈가 없습니다.</strong></div>}
      {params.quiz === "invalid_quiz" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>문제는 180자 이하, 정답은 100자 이하로 입력해 주세요.</strong></div>}
      {params.quiz === "not_live" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>방송이 시작된 뒤 출제해 주세요.</strong></div>}
      {params.quiz === "bot_required" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>봇을 방송에 입장시킨 뒤 시작해 주세요.</strong></div>}
      {params.quiz === "missing_scope" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>채팅 이벤트와 전송 권한이 필요합니다.</strong></div>}
      {params.quiz === "queued" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>대기 문제에 추가했습니다. 방송 중 <code>!퀴즈 시작</code>으로 출제됩니다.</strong></div>}
      {params.quiz === "queue_deleted" && <div className="settings-notice is-success" role="status"><span aria-hidden="true">✓</span><strong>대기 문제를 삭제했습니다.</strong></div>}
      {params.quiz === "queue_full" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>대기 문제는 최대 50개까지 등록할 수 있습니다.</strong></div>}
      {params.quiz === "queue_empty" && <div className="settings-notice is-error" role="alert"><span aria-hidden="true">!</span><strong>등록된 대기 문제가 없습니다.</strong></div>}

      {quizRound?.active ? (
        <>
          <div className="rps-active-round">
            <div className="rps-round-number">
              <span>문제 #{quizRound.roundId}</span>
              <strong>{quizRound.question}</strong>
              <small>정답: {quizRound.answer}</small>
            </div>
            <div className="rps-live-count" role="status" aria-live="polite" aria-atomic="true">
              <span>현재 제출자</span>
              <strong>{quizRound.submissions.length.toLocaleString("ko-KR")}<small>명</small></strong>
            </div>
            <form action="/game/quiz" method="post">
              <input type="hidden" name="action" value="finish" />
              <button className="rps-finish" type="submit">퀴즈 종료 및 정답 공개</button>
            </form>
          </div>
          {quizRound.submissions.length > 0 && (
            <section className="rps-history quiz-live-submissions" aria-labelledby="quiz-submissions-title">
              <div className="rps-history-heading">
                <h4 id="quiz-submissions-title">최신 제출 순서</h4>
                <span>다시 제출하면 순서가 뒤로 이동합니다.</span>
              </div>
              <ol>
                {quizRound.submissions.map((submission) => (
                  <li key={submission.userId}>
                    <strong>{submission.nickname}</strong>
                    <span>{submission.answer}</span>
                    <time dateTime={new Date(submission.submittedAt).toISOString()}>{formatDateTime(submission.submittedAt)}</time>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      ) : null}

      <section className="rps-history quiz-queue" aria-labelledby="quiz-queue-title">
        <div className="rps-history-heading">
          <h4 id="quiz-queue-title">대기 문제</h4>
          <span>방송 전에 등록해 두면 채팅의 <code>!퀴즈 시작</code>으로 위에서부터 출제됩니다. 정답은 채팅에 노출되지 않습니다.</span>
        </div>
        {quizQueue.length > 0 ? (
          <ol>
            {quizQueue.map((item) => (
              <li key={item.id}>
                <strong>{item.question}</strong>
                <span>정답: {item.answer}</span>
                <form action="/game/quiz" method="post">
                  <input type="hidden" name="action" value="queue_delete" />
                  <input type="hidden" name="id" value={item.id} />
                  <ConfirmButton className="is-danger" type="submit" message="이 대기 문제를 삭제할까요?">삭제</ConfirmButton>
                </form>
              </li>
            ))}
          </ol>
        ) : <p>등록된 대기 문제가 없습니다.</p>}
        {/* One form, two buttons: Enter (the first button) only queues, so a
            question meant for later is never published by accident. */}
        <form className="quiz-queue-form" action="/game/quiz" method="post">
          <label>문제<input name="question" maxLength={180} placeholder="대한민국의 수도는?" required /></label>
          <label>정답<input name="answer" maxLength={100} placeholder="서울" required /></label>
          <div className="quiz-queue-actions">
            <button type="submit" name="action" value="queue_add">대기 목록에 추가</button>
            {!quizRound?.active && (
              <button
                className="is-secondary"
                type="submit"
                name="action"
                value="start"
                disabled={!bot.enabled || !hasChatScope || !scopes.includes("events.chat")}
              >
                지금 바로 출제
              </button>
            )}
          </div>
        </form>
        {!quizRound?.active && quizQueue.length > 0 && (
          <form action="/game/quiz" method="post">
            <input type="hidden" name="action" value="start_next" />
            <button type="submit" disabled={!bot.enabled || !hasChatScope || !scopes.includes("events.chat")}>
              다음 대기 문제 출제
            </button>
          </form>
        )}
      </section>

      {quizHistory.length > 0 && (
        <section className="rps-history" aria-labelledby="quiz-history-title">
          <div className="rps-history-heading">
            <h4 id="quiz-history-title">퀴즈 기록</h4>
            <span>최근 {quizHistory.length}개</span>
          </div>
          {quizHistory.map((round, index) => (
            <details className="rps-history-round quiz-history-round" key={round.roundId} open={index === 0}>
              <summary>
                <span className="quiz-history-question"><small>문제 #{round.roundId}</small><strong>{round.question}</strong></span>
                <span className="quiz-history-result">최초 정답 - {getFirstCorrectAt(round.submissions) === null
                  ? "없음"
                  : round.submissions.filter((submission) => submission.correctAt === getFirstCorrectAt(round.submissions)).map((submission) => submission.nickname).join(", ")} (정답자 {round.submissions.filter((submission) => submission.correct).length}명)</span>
              </summary>
              <p className="quiz-history-answer">정답: <strong>{round.answer}</strong></p>
              {round.submissions.length > 0 ? (
                <ol>
                  {round.submissions.map((submission) => (
                    <li key={submission.userId}>
                      <strong>{submission.nickname}</strong>
                      <span>{submission.answer}</span>
                      <em className={submission.correct ? "is-win" : ""}>
                        {submission.correct
                          ? `${submission.correctAt === getFirstCorrectAt(round.submissions) ? "최초 정답" : "정답"} · ${formatElapsedTime(Math.max(0, (submission.correctAt ?? round.startedAt) - round.startedAt))}`
                          : "오답"}
                      </em>
                    </li>
                  ))}
                </ol>
              ) : <p>제출된 답안이 없습니다. 정답은 {round.answer}입니다.</p>}
            </details>
          ))}
        </section>
      )}

      <p className="game-command"><code>!정답 정답내용</code></p>
    </section>
  );
}
