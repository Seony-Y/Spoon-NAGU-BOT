import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthSession } from "@/lib/auth";
import { ensureBotRunning, getBotSnapshot } from "@/lib/bot-runtime";
import { AUTOMATION_LABELS, MAX_RAFFLE_WINNERS, type AutomationFeature } from "@/lib/dj-command";
import { SESSION_COOKIE } from "@/lib/session";
import {
  getBotSettings,
  getQuizRoundByKey,
  getRaffleRoundByKey,
  getRouletteSettings,
  getRpsRound,
  getSessionKey,
  listBotCounters,
  listQuizQueue,
} from "@/lib/session-store";
import { ClearStatusParams } from "../clear-status-params";
import { AutoRefresh } from "../refresh-live-button";
import { EnvironmentBadge } from "../site-chrome";

export const metadata: Metadata = {
  title: "리모컨 | NAGU BOT",
  description: "방송 중 휴대폰으로 게임과 자동화를 조작하는 NAGU BOT 리모컨",
};

type RemoteProps = {
  searchParams: Promise<{ r?: string }>;
};

const RESULT_NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  rps_started: { tone: "success", text: "가위바위보를 시작했습니다. DJ 선택은 랜덤입니다." },
  rps_finished: { tone: "success", text: "가위바위보 결과를 채팅에 공개했습니다." },
  raffle_started: { tone: "success", text: "추첨을 시작했습니다." },
  raffle_finished: { tone: "success", text: "당첨자를 채팅에 공개했습니다." },
  quiz_started: { tone: "success", text: "다음 대기 문제를 출제했습니다." },
  quiz_finished: { tone: "success", text: "퀴즈 정답과 결과를 공개했습니다." },
  quiz_queue_empty: { tone: "error", text: "대기 문제가 없습니다. 대시보드 게임 > 퀴즈에서 먼저 등록해 주세요." },
  raffle_invalid_winner_count: { tone: "error", text: `당첨 인원은 1~${MAX_RAFFLE_WINNERS.toLocaleString("ko-KR")}명으로 입력해 주세요.` },
  counter_saved: { tone: "success", text: "변경한 값을 채팅에 알렸습니다." },
  switch_saved: { tone: "success", text: "켜기·끄기를 반영했습니다." },
  authentication_required: { tone: "error", text: "연결이 만료되었습니다. 대시보드에서 다시 연결해 주세요." },
  invalid: { tone: "error", text: "처리하지 못했습니다. 화면을 새로고침한 뒤 다시 눌러 주세요." },
};

const FAILURE_NOTICES: Record<string, string> = {
  bot_required: "봇이 방송에 입장해 있을 때만 진행할 수 있습니다.",
  missing_scope: "채팅 권한이 없습니다. 대시보드에서 다시 연결해 주세요.",
  already_active: "이미 진행 중입니다. 먼저 종료해 주세요.",
  not_active: "진행 중인 게임이 없습니다.",
};

function resolveNotice(result: string | undefined) {
  if (!result) return null;
  if (RESULT_NOTICES[result]) return RESULT_NOTICES[result];
  const failure = Object.keys(FAILURE_NOTICES).find((key) => result.endsWith(`_${key}`));
  return failure ? { tone: "error" as const, text: FAILURE_NOTICES[failure] } : null;
}

function Toggle({ action, feature, label, enabled }: {
  action: "roulette" | "automation";
  feature?: AutomationFeature;
  label: string;
  enabled: boolean;
}) {
  return (
    <form action="/remote/action" method="post">
      <input type="hidden" name="action" value={action} />
      {feature && <input type="hidden" name="feature" value={feature} />}
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <button
        className={`remote-toggle${enabled ? " is-on" : ""}`}
        type="submit"
        aria-pressed={enabled}
        aria-label={`${label} ${enabled ? "끄기" : "켜기"}`}
      >
        <span>{label}</span>
        <strong>{enabled ? "ON" : "OFF"}</strong>
      </button>
    </form>
  );
}

function ActionButton({ action, label, tone = "primary", disabled = false }: {
  action: string;
  label: string;
  tone?: "primary" | "finish";
  disabled?: boolean;
}) {
  return (
    <form action="/remote/action" method="post">
      <input type="hidden" name="action" value={action} />
      <button className={`remote-button is-${tone}`} type="submit" disabled={disabled}>{label}</button>
    </form>
  );
}

export default async function RemotePage({ searchParams }: RemoteProps) {
  const { r } = await searchParams;
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);

  if (!sessionId || !session) {
    return (
      <main className="remote">
        <h1 className="remote-title">NAGU BOT 리모컨</h1>
        <p className="remote-empty">
          이 브라우저에서 Spoon 계정이 연결되어 있지 않습니다. <Link href="/">대시보드</Link>에서 먼저 연결해 주세요.
        </p>
      </main>
    );
  }

  ensureBotRunning(sessionId);
  const sessionKey = getSessionKey(sessionId);
  const bot = getBotSnapshot(sessionId);
  const rps = getRpsRound(sessionId);
  const raffle = getRaffleRoundByKey(sessionKey);
  const quiz = getQuizRoundByKey(sessionKey);
  const quizQueue = listQuizQueue(sessionId);
  const counters = listBotCounters(sessionId);
  const settings = getBotSettings(sessionId);
  const roulette = getRouletteSettings(sessionId);
  const notice = resolveNotice(r);
  const gameDisabled = !bot.enabled;
  const automation: Array<[AutomationFeature, boolean]> = [
    ["welcome", settings.welcomeEnabled],
    ["donation", settings.donationEnabled],
    ["heart", settings.heartEnabled],
    ["follow", settings.followEnabled],
    ["repeat", settings.repeatEnabled],
  ];

  return (
    <main className="remote">
      <AutoRefresh intervalMs={3000} />
      <ClearStatusParams keys="r" delayMs={4000} />
      <header className="remote-header">
        <h1 className="remote-title">NAGU BOT 리모컨 <EnvironmentBadge /></h1>
        <span className={`remote-state${bot.state === "connected" ? " is-live" : ""}`}>
          {bot.state === "connected" ? "봇 입장 중" : bot.enabled ? "방송 기다리는 중" : "봇 꺼짐"}
        </span>
      </header>

      {notice && (
        <p className={`remote-notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      )}
      {!bot.enabled && (
        <p className="remote-notice is-error" role="alert">
          봇이 방송에 입장하지 않았습니다. <Link href="/?tab=bot">대시보드</Link>에서 [봇 입장]을 눌러 주세요.
        </p>
      )}

      <section className="remote-card" aria-labelledby="remote-rps">
        <div className="remote-card-heading">
          <h2 id="remote-rps">가위바위보</h2>
          <span>{rps?.active ? `진행 중 · ${rps.entries.length}명` : "대기"}</span>
        </div>
        {rps?.active
          ? <ActionButton action="rps_finish" label="종료하고 결과 공개" tone="finish" />
          : <ActionButton action="rps_start" label="시작 (DJ 선택 랜덤)" disabled={gameDisabled} />}
      </section>

      <section className="remote-card" aria-labelledby="remote-raffle">
        <div className="remote-card-heading">
          <h2 id="remote-raffle">추첨</h2>
          <span>{raffle?.active ? `진행 중 · ${raffle.entries.length}명 참여 · ${raffle.winnerCount}명 당첨` : "대기"}</span>
        </div>
        {raffle?.active ? (
          <ActionButton action="raffle_finish" label="종료하고 당첨자 공개" tone="finish" />
        ) : (
          <form className="remote-inline-form" action="/remote/action" method="post">
            <input type="hidden" name="action" value="raffle_start" />
            <label>
              <span>당첨 인원</span>
              <input type="number" name="winnerCount" inputMode="numeric" min={1} max={MAX_RAFFLE_WINNERS} defaultValue={1} required />
            </label>
            <button className="remote-button is-primary" type="submit" disabled={gameDisabled}>시작</button>
          </form>
        )}
      </section>

      <section className="remote-card" aria-labelledby="remote-quiz">
        <div className="remote-card-heading">
          <h2 id="remote-quiz">퀴즈</h2>
          <span>{quiz?.active ? `진행 중 · ${quiz.submissions.length}명 제출` : `대기 문제 ${quizQueue.length}개`}</span>
        </div>
        {quiz?.active ? (
          <>
            <p className="remote-quiz-question">{quiz.question}</p>
            <p className="remote-quiz-answer">정답: <strong>{quiz.answer}</strong> <small>(이 화면에만 표시)</small></p>
            <ActionButton action="quiz_finish" label="종료하고 정답 공개" tone="finish" />
          </>
        ) : quizQueue.length > 0 ? (
          <>
            <p className="remote-quiz-question">다음 문제: {quizQueue[0].question}</p>
            <ActionButton action="quiz_start" label="다음 문제 출제" disabled={gameDisabled} />
          </>
        ) : (
          <p className="remote-empty">대시보드 게임 &gt; 퀴즈에서 대기 문제를 먼저 등록해 주세요.</p>
        )}
      </section>

      {counters.length > 0 && (
        <section className="remote-card" aria-labelledby="remote-counters">
          <div className="remote-card-heading">
            <h2 id="remote-counters">카운터</h2>
            <span>변경 시 채팅에 알림</span>
          </div>
          <ul className="remote-counters">
            {counters.map((counter) => (
              <li key={counter.id}>
                <span>{counter.name}</span>
                <strong>{counter.value.toLocaleString("ko-KR")}</strong>
                {[-1, 1].map((delta) => (
                  <form key={delta} action="/remote/action" method="post">
                    <input type="hidden" name="action" value="counter" />
                    <input type="hidden" name="id" value={counter.id} />
                    <input type="hidden" name="delta" value={delta} />
                    <button
                      className="remote-step"
                      type="submit"
                      disabled={delta < 0 && counter.value === 0}
                      aria-label={`${counter.name} ${delta > 0 ? "1 늘리기" : "1 줄이기"}`}
                    >
                      {delta > 0 ? "+1" : "−1"}
                    </button>
                  </form>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="remote-card" aria-labelledby="remote-switches">
        <div className="remote-card-heading">
          <h2 id="remote-switches">자동 기능 켜기·끄기</h2>
        </div>
        <div className="remote-toggles">
          <Toggle action="roulette" label="룰렛" enabled={roulette.enabled} />
          {automation.map(([feature, enabled]) => (
            <Toggle key={feature} action="automation" feature={feature} label={AUTOMATION_LABELS[feature]} enabled={enabled} />
          ))}
        </div>
      </section>

      <p className="remote-footer">
        <Link href="/">대시보드로 이동</Link> · 채팅에 <code>!봇</code>을 입력해도 같은 조작을 할 수 있습니다.
      </p>
    </main>
  );
}
