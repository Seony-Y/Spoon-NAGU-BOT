import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthSession } from "@/lib/auth";
import { ensureBotRunning, getBotSnapshot } from "@/lib/bot-runtime";
import { AUTOMATION_LABELS, MAX_RAFFLE_WINNERS, type AutomationFeature } from "@/lib/dj-command";
import { MAX_COUNTER_VALUE } from "@/lib/live-actions";
import { SESSION_COOKIE } from "@/lib/session";
import {
  getBotSettings,
  getQuizRoundByKey,
  getRaffleRoundByKey,
  getRouletteSettings,
  getRpsRound,
  getSessionKey,
  listBotCounters,
  getActiveSecretWordByKey,
  getActiveTeamBattleByKey,
  getTeamBattleSettings,
  listQuizQueue,
  listSecretWordQueue,
} from "@/lib/session-store";
import { ClearStatusParams } from "../clear-status-params";
import { AutoRefresh } from "../refresh-live-button";
import { EnvironmentBadge } from "../site-chrome";

export const metadata: Metadata = {
  title: "리모컨 | NAGU BOT",
  description: "방송 중 휴대폰으로 게임과 자동화를 조작하는 NAGU BOT 리모컨",
};

type RemoteView = "games" | "counters" | "switches";

type RemoteProps = {
  searchParams: Promise<{ r?: string; view?: string; fn?: string }>;
};

const RESULT_NOTICES: Record<string, { tone: "success" | "error"; text: string }> = {
  rps_started: { tone: "success", text: "가위바위보를 시작했습니다. DJ 선택은 랜덤입니다." },
  rps_finished: { tone: "success", text: "가위바위보 결과를 채팅에 공개했습니다." },
  raffle_started: { tone: "success", text: "추첨을 시작했습니다." },
  raffle_finished: { tone: "success", text: "당첨자를 채팅에 공개했습니다." },
  quiz_started: { tone: "success", text: "다음 대기 문제를 출제했습니다." },
  quiz_finished: { tone: "success", text: "퀴즈 정답과 결과를 공개했습니다." },
  team_started: { tone: "success", text: "팀 대항전을 시작했습니다." },
  team_status_sent: { tone: "success", text: "현재 점수를 채팅에 알렸습니다." },
  team_finished: { tone: "success", text: "팀 대항전 결과를 공개했습니다." },
  secret_started: { tone: "success", text: "비밀 단어 찾기를 시작했습니다." },
  secret_hint_sent: { tone: "success", text: "힌트를 채팅에 공개했습니다." },
  secret_finished: { tone: "success", text: "비밀 단어를 공개하고 종료했습니다." },
  secret_secret_queue_empty: { tone: "error", text: "대기 단어가 없습니다. 대시보드 게임 > 비밀 단어에서 먼저 등록해 주세요." },
  quiz_queue_empty: { tone: "error", text: "대기 문제가 없습니다. 대시보드 게임 > 퀴즈에서 먼저 등록해 주세요." },
  raffle_invalid_winner_count: { tone: "error", text: `당첨 인원은 1~${MAX_RAFFLE_WINNERS.toLocaleString("ko-KR")}명으로 입력해 주세요.` },
  counter_saved: { tone: "success", text: "변경한 값을 채팅에 알렸습니다." },
  counter_unchanged: { tone: "success", text: "현재 값과 같아서 바꾸지 않았습니다." },
  counter_invalid: { tone: "error", text: `카운터 값은 0~${MAX_COUNTER_VALUE.toLocaleString("ko-KR")} 사이 정수로 입력해 주세요.` },
  switch_saved: { tone: "success", text: "켜기·끄기를 반영했습니다." },
  authentication_required: { tone: "error", text: "연결이 만료되었습니다. 대시보드에서 다시 연결해 주세요." },
  invalid: { tone: "error", text: "처리하지 못했습니다. 화면을 새로고침한 뒤 다시 눌러 주세요." },
};

const FAILURE_NOTICES: Record<string, string> = {
  bot_required: "봇이 방송에 입장해 있을 때만 진행할 수 있습니다.",
  not_live: "방송 중일 때만 시작할 수 있습니다.",
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
        <span className="remote-switch" aria-hidden="true"><span /></span>
      </button>
    </form>
  );
}

function ActionButton({ action, label, tone = "primary", disabled = false }: {
  action: string;
  label: string;
  tone?: "primary" | "secondary" | "finish";
  disabled?: boolean;
}) {
  return (
    <form action="/remote/action" method="post">
      <input type="hidden" name="action" value={action} />
      <button className={`remote-button is-${tone}`} type="submit" disabled={disabled}>{label}</button>
    </form>
  );
}

const VIEWS: Array<{ key: RemoteView; icon: string; label: string }> = [
  { key: "games", icon: "🎮", label: "게임" },
  { key: "counters", icon: "🔢", label: "카운터" },
  { key: "switches", icon: "⚙️", label: "자동 기능" },
];

function GameCard({ id, icon, title, status, active, children }: {
  id: string;
  icon: string;
  title: string;
  status: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`remote-card${active ? " is-active" : ""}`} aria-labelledby={id}>
      <div className="remote-card-heading">
        <h2 id={id}><span className="remote-icon" aria-hidden="true">{icon}</span>{title}</h2>
        <span className={`remote-pill${active ? " is-live" : ""}`}>{status}</span>
      </div>
      {children}
    </section>
  );
}

export default async function RemotePage({ searchParams }: RemoteProps) {
  const { r, view: viewParam, fn } = await searchParams;
  const view: RemoteView = viewParam === "counters" || viewParam === "switches" ? viewParam : "games";
  const sessionId = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);

  if (!sessionId || !session) {
    return (
      <main className="remote">
        <h1 className="remote-title">NAGU BOT 리모컨</h1>
        <div className="remote-alert">
          <p>이 브라우저에서 Spoon 계정이 연결되어 있지 않습니다.</p>
          <Link className="remote-button is-primary" href="/">대시보드에서 연결하기</Link>
        </div>
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
  const secretWord = getActiveSecretWordByKey(sessionKey);
  const secretWordQueue = listSecretWordQueue(sessionId);
  const teamBattle = getActiveTeamBattleByKey(sessionKey);
  const teamSettings = getTeamBattleSettings(sessionId);
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
  const switchesOn = [roulette.enabled, ...automation.map(([, enabled]) => enabled)].filter(Boolean).length;

  // Running games first, so the one being played is always on top.
  const games = [
    {
      key: "rps",
      active: Boolean(rps?.active),
      node: (
        <GameCard key="rps" id="remote-rps" icon="✊" title="가위바위보" active={Boolean(rps?.active)}
          status={rps?.active ? `진행 중 · ${rps.entries.length}명` : "대기"}>
          {rps?.active
            ? <ActionButton action="rps_finish" label="종료하고 결과 공개" tone="finish" />
            : <ActionButton action="rps_start" label="시작 (DJ 선택 랜덤)" disabled={gameDisabled} />}
        </GameCard>
      ),
    },
    {
      key: "raffle",
      active: Boolean(raffle?.active),
      node: (
        <GameCard key="raffle" id="remote-raffle" icon="🎁" title="추첨" active={Boolean(raffle?.active)}
          status={raffle?.active ? `진행 중 · ${raffle.entries.length}명 · ${raffle.winnerCount}명 당첨` : "대기"}>
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
        </GameCard>
      ),
    },
    {
      key: "quiz",
      active: Boolean(quiz?.active),
      node: (
        <GameCard key="quiz" id="remote-quiz" icon="❓" title="퀴즈" active={Boolean(quiz?.active)}
          status={quiz?.active ? `진행 중 · ${quiz.submissions.length}명 제출` : `대기 문제 ${quizQueue.length}개`}>
          {quiz?.active ? (
            <>
              <p className="remote-quiz-question">{quiz.question}</p>
              <p className="remote-secret">정답 <strong>{quiz.answer}</strong><small>이 화면에만 보여요</small></p>
              <ActionButton action="quiz_finish" label="종료하고 정답 공개" tone="finish" />
            </>
          ) : quizQueue.length > 0 ? (
            <>
              <p className="remote-quiz-answer">다음 문제: {quizQueue[0].question}</p>
              <ActionButton action="quiz_start" label="다음 문제 출제" disabled={gameDisabled} />
            </>
          ) : (
            <Link className="remote-button is-ghost" href="/?tab=game&game=quiz">대시보드에서 문제 등록하기</Link>
          )}
        </GameCard>
      ),
    },
    {
      key: "secret",
      active: Boolean(secretWord),
      node: (
        <GameCard key="secret" id="remote-secret" icon="🔍" title="비밀 단어" active={Boolean(secretWord)}
          status={secretWord ? "진행 중" : `대기 단어 ${secretWordQueue.length}개`}>
          {secretWord ? (
            <>
              <p className="remote-secret">정답 <strong>{secretWord.word}</strong><small>이 화면에만 보여요</small></p>
              {secretWord.hint && <p className="remote-quiz-answer">힌트: {secretWord.hint}</p>}
              <div className="remote-button-row">
                {secretWord.hint && <ActionButton action="secret_hint" label="힌트 공개" tone="secondary" />}
                <ActionButton action="secret_finish" label="종료하고 공개" tone="finish" />
              </div>
            </>
          ) : secretWordQueue.length > 0 ? (
            <ActionButton action="secret_start" label="다음 단어로 시작" disabled={gameDisabled} />
          ) : (
            <Link className="remote-button is-ghost" href="/?tab=game&game=secret">대시보드에서 단어 등록하기</Link>
          )}
        </GameCard>
      ),
    },
    {
      key: "team",
      active: Boolean(teamBattle),
      node: (
        <GameCard key="team" id="remote-team" icon="🚩" title="팀 대항전" active={Boolean(teamBattle)}
          status={teamBattle ? "진행 중" : `${teamSettings.teamNames.length}개 팀`}>
          {teamBattle ? (
            <>
              <ul className="remote-scores">
                {teamBattle.teams.map((team) => (
                  <li key={team.index}>
                    <span>{team.name}</span>
                    <strong>{team.score.toLocaleString("ko-KR")}</strong>
                    <small>{team.members}명</small>
                  </li>
                ))}
              </ul>
              <div className="remote-button-row">
                <ActionButton action="team_status" label="점수 알리기" tone="secondary" />
                <ActionButton action="team_finish" label="종료하고 발표" tone="finish" />
              </div>
            </>
          ) : (
            <ActionButton action="team_start" label="저장된 설정으로 시작" disabled={gameDisabled} />
          )}
        </GameCard>
      ),
    },
  ].sort((left, right) => Number(right.active) - Number(left.active));
  const activeGames = games.filter((game) => game.active).length;
  const badges: Record<RemoteView, string | null> = {
    games: activeGames > 0 ? `${activeGames}` : null,
    counters: counters.length > 0 ? `${counters.length}` : null,
    switches: `${switchesOn}`,
  };

  // Remounted after each form submit, like the reload it replaces (form-navigation.tsx).
  return (
    <main className="remote" key={fn}>
      <AutoRefresh intervalMs={3000} />
      <ClearStatusParams keys="r" delayMs={4000} />
      <header className="remote-header">
        <div>
          <h1 className="remote-title">NAGU BOT 리모컨 <EnvironmentBadge /></h1>
          <span className={`remote-state${bot.state === "connected" ? " is-live" : ""}`}>
            <span className="status-dot" aria-hidden="true" />
            {bot.state === "connected" ? "봇 입장 중" : bot.enabled ? "방송 기다리는 중" : "봇 꺼짐"}
          </span>
        </div>
        <Link className="remote-nav-button" href="/">대시보드</Link>
      </header>

      {notice && (
        <p className={`remote-notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      )}
      {!bot.enabled && (
        <div className="remote-alert" role="alert">
          <p>봇이 방송에 들어와 있지 않아요.</p>
          <Link className="remote-button is-primary" href="/?tab=bot">봇 입장하러 가기</Link>
        </div>
      )}

      <nav className="remote-tabs" aria-label="리모컨 메뉴">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            className={view === item.key ? "is-active" : ""}
            href={item.key === "games" ? "/remote" : `/remote?view=${item.key}`}
            aria-current={view === item.key ? "page" : undefined}
            scroll={false}
          >
            <span className="remote-tab-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
            {badges[item.key] && <span className="remote-tab-badge">{badges[item.key]}</span>}
          </Link>
        ))}
      </nav>

      {view === "games" && games.map((game) => game.node)}

      {view === "counters" && (
        counters.length > 0 ? (
          <section className="remote-card" aria-labelledby="remote-counters">
            <div className="remote-card-heading">
              <h2 id="remote-counters"><span className="remote-icon" aria-hidden="true">🔢</span>카운터</h2>
              <span className="remote-pill">적용하면 채팅에 알림</span>
            </div>
            <ul className="remote-counters">
              {counters.map((counter) => (
                <li key={counter.id} className="remote-counter-row">
                  <span>{counter.name}</span>
                  <strong>{counter.value.toLocaleString("ko-KR")}{counter.goal !== null && <small> / {counter.goal.toLocaleString("ko-KR")}</small>}</strong>
                  <form className="remote-counter-form" action="/remote/action" method="post">
                    <input type="hidden" name="action" value="counter_set" />
                    <input type="hidden" name="id" value={counter.id} />
                    {/* Keyed by the value so a change from chat replaces the field. */}
                    <input
                      key={counter.value}
                      name="value"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_COUNTER_VALUE}
                      step={1}
                      required
                      defaultValue={counter.value}
                      aria-label={`${counter.name} 새 값`}
                    />
                    <button type="submit">적용</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="remote-alert">
            <p>등록된 카운터가 없어요.</p>
            <Link className="remote-button is-ghost" href="/?tab=bot&automation=counters">대시보드에서 카운터 만들기</Link>
          </div>
        )
      )}

      {view === "switches" && (
        <section className="remote-card" aria-labelledby="remote-switches">
          <div className="remote-card-heading">
            <h2 id="remote-switches"><span className="remote-icon" aria-hidden="true">⚙️</span>자동 기능</h2>
            <span className="remote-pill">눌러서 켜기·끄기</span>
          </div>
          <div className="remote-toggles">
            <Toggle action="roulette" label="룰렛" enabled={roulette.enabled} />
            {automation.map(([feature, enabled]) => (
              <Toggle key={feature} action="automation" feature={feature} label={AUTOMATION_LABELS[feature]} enabled={enabled} />
            ))}
          </div>
        </section>
      )}

      <p className="remote-footer">채팅에 <code>!봇</code>을 입력해도 같은 조작을 할 수 있어요.</p>
    </main>
  );
}
