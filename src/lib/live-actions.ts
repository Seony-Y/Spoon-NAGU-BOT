import "server-only";

import { randomInt } from "node:crypto";
import { sendBotChat } from "./chat";
import { flushGameAcks } from "./chat-acks";
import { formatMultilineMessages } from "./chat-message";
import {
  AUTOMATION_LABELS,
  DJ_COMMAND_HELP,
  type AutomationFeature,
  type DjCommand,
} from "./dj-command";
import { formatRaffleResultMessages } from "./raffle";
import { formatRpsResultMessages, RPS_CHOICES, type RpsChoice } from "./rock-paper-scissors";
import {
  applyBotCounterCommand,
  finishQuizRoundByKey,
  finishSecretWordByKey,
  finishTeamBattleByKey,
  getActiveTeamBattleByKey,
  SPOON_POINTS_IN_BOTH,
  startTeamBattleByKey,
  type TeamBattle,
  type TeamBattleMetric,
  type TeamBattleOutcome,
  type TeamScore,
  getActiveSecretWordByKey,
  listSecretWordQueueByKey,
  startNextSecretWordByKey,
  finishRaffleRoundByKey,
  finishRpsRoundByKey,
  formatQuizResultMessages,
  getBotSettingsByKey,
  getQuizRoundByKey,
  getRaffleRoundByKey,
  getRouletteSettingsByKey,
  getRpsRoundByKey,
  getSessionByKey,
  getWorkspaceBotSessionKey,
  isBotEnabledByKey,
  isValidQuiz,
  listBotCountersByKey,
  listQuizQueueByKey,
  startNextQueuedQuizByKey,
  startQuizRoundByKey,
  startRaffleRoundByKey,
  startRpsRoundByKey,
  updateBotSettingsByKey,
  updateRouletteSettingsByKey,
  getCurrentLiveIdByKey,
} from "./session-store";

// Shared live-broadcast actions. The dashboard routes, DJ chat commands and the
// remote page all call these so validation and chat announcements stay in one place.

export type LiveActionFailure =
  | "bot_required"
  | "missing_scope"
  | "already_active"
  | "not_active"
  | "invalid_winner_count"
  | "invalid_quiz"
  | "queue_empty"
  | "secret_queue_empty"
  | "not_live";

export type LiveActionResult =
  | { ok: true; status: string }
  | { ok: false; status: LiveActionFailure };

const FAILURE_REPLIES: Record<LiveActionFailure, string> = {
  bot_required: "봇이 방송에 들어와 있을 때만 할 수 있어요.",
  not_live: "방송 중일 때만 시작할 수 있어요.",
  missing_scope: "봇 채팅 권한이 없어 진행할 수 없어요.",
  already_active: "이미 진행 중이에요. 먼저 종료해 주세요.",
  not_active: "지금 진행 중인 게임이 없어요.",
  invalid_winner_count: "당첨 인원을 다시 확인해 주세요.",
  invalid_quiz: "퀴즈 문제나 정답을 다시 확인해 주세요.",
  queue_empty: "준비된 퀴즈가 없어요.",
  secret_queue_empty: "준비된 비밀 단어가 없어요.",
};

// Sends through the session that runs the DJ's bot, so a press on another of the
// DJ's devices (e.g. the phone remote) shares its chat queue and echo guard.
function botSessionOf(sessionKey: string) {
  return getWorkspaceBotSessionKey(sessionKey) ?? sessionKey;
}

function fail(status: LiveActionFailure): LiveActionResult {
  return { ok: false, status };
}

function checkChatGame(sessionKey: string): LiveActionFailure | null {
  if (!isBotEnabledByKey(sessionKey)) return "bot_required";
  const scopes = getSessionByKey(sessionKey)?.scope.split(" ") ?? [];
  if (!scopes.includes("events.chat") || !scopes.includes("chat.send")) return "missing_scope";
  // The start announcement would be dropped offline (and a queued word used up).
  if (getCurrentLiveIdByKey(sessionKey) === undefined) return "not_live";
  return null;
}

// Queues without waiting for delivery: enqueueing already fixes the order, and
// the DJ's button press should not hang while a long result is being sent.
async function announce(sessionKey: string, messages: string[]) {
  for (const message of messages) void sendBotChat(sessionKey, message);
}

export async function startRps(sessionKey: string, djChoice?: RpsChoice): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const blocked = checkChatGame(sessionKey);
  if (blocked) return fail(blocked);
  const choice = djChoice ?? RPS_CHOICES[randomInt(RPS_CHOICES.length)];
  if (!startRpsRoundByKey(sessionKey, choice)) return fail("already_active");
  await announce(sessionKey, [
    "[가위바위보] 시작! 채팅에 '!가위바위보 가위'처럼 가위·바위·보 중 하나를 입력해 주세요. (1인 1회)",
  ]);
  return { ok: true, status: "started" };
}

export async function finishRps(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const round = finishRpsRoundByKey(sessionKey);
  if (!round) return fail("not_active");
  flushGameAcks(sessionKey, "rps");
  await announce(sessionKey, formatRpsResultMessages(round.entries, round.djChoice));
  return { ok: true, status: "finished" };
}

export async function startRaffle(sessionKey: string, winnerCount: number): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const blocked = checkChatGame(sessionKey);
  if (blocked) return fail(blocked);
  if (!Number.isSafeInteger(winnerCount) || winnerCount < 1) return fail("invalid_winner_count");
  if (!startRaffleRoundByKey(sessionKey, winnerCount)) return fail("already_active");
  await announce(sessionKey, [
    `[추첨] 시작! 채팅에 '!참여'를 입력하면 응모돼요. (1인 1회 · ${winnerCount.toLocaleString("ko-KR")}명 당첨)`,
  ]);
  return { ok: true, status: "started" };
}

export async function finishRaffle(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const round = finishRaffleRoundByKey(sessionKey);
  if (!round) return fail("not_active");
  flushGameAcks(sessionKey, "raffle");
  const winners = round.entries.filter((entry) => entry.winner);
  await announce(sessionKey, [
    `[추첨] 종료! ${round.entries.length.toLocaleString("ko-KR")}명 중 ${winners.length.toLocaleString("ko-KR")}명 당첨`,
    ...formatRaffleResultMessages(winners),
  ]);
  return { ok: true, status: "finished" };
}

function quizStartMessages(question: string) {
  return [`[퀴즈] ${question}`, "채팅에 '!정답 (답)'으로 답을 적어 주세요. 다시 내면 마지막 답으로 바뀌어요."];
}

export async function startQuiz(sessionKey: string, question: string, answer: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const blocked = checkChatGame(sessionKey);
  if (blocked) return fail(blocked);
  if (!isValidQuiz(question, answer)) return fail("invalid_quiz");
  if (!startQuizRoundByKey(sessionKey, question, answer)) return fail("already_active");
  await announce(sessionKey, quizStartMessages(question.trim()));
  return { ok: true, status: "started" };
}

export async function startNextQuiz(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const blocked = checkChatGame(sessionKey);
  if (blocked) return fail(blocked);
  if (getQuizRoundByKey(sessionKey)?.active) return fail("already_active");
  const started = startNextQueuedQuizByKey(sessionKey);
  if (started.kind === "empty") return fail("queue_empty");
  if (started.kind === "already_active") return fail("already_active");
  await announce(sessionKey, quizStartMessages(started.question));
  return { ok: true, status: "started" };
}

export async function finishQuiz(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const round = finishQuizRoundByKey(sessionKey);
  if (!round) return fail("not_active");
  flushGameAcks(sessionKey, "quiz");
  await announce(sessionKey, formatQuizResultMessages(round));
  return { ok: true, status: "finished" };
}

// Same path as the DJ typing `!이름 +N` in chat, including the announcement.
export async function adjustCounter(sessionKey: string, counterId: number, delta: number) {
  sessionKey = botSessionOf(sessionKey);
  const counter = listBotCountersByKey(sessionKey).find((item) => item.id === counterId);
  if (!counter || !Number.isSafeInteger(delta) || delta === 0) return false;
  const reply = applyBotCounterCommand(
    sessionKey,
    `!${counter.name} ${delta > 0 ? "+" : ""}${delta}`,
    true,
  );
  if (reply) await sendBotChat(sessionKey, reply);
  return true;
}

// One change in chat may move a counter by at most 1,000,000.
export const MAX_COUNTER_VALUE = 1_000_000;

// The remote's "type the new value" path: announced like `!이름 +N`.
export async function setCounterValue(sessionKey: string, counterId: number, value: number) {
  const counter = listBotCountersByKey(botSessionOf(sessionKey)).find((item) => item.id === counterId);
  if (!counter || !Number.isSafeInteger(value) || value < 0 || value > MAX_COUNTER_VALUE) return "invalid" as const;
  if (value === counter.value) return "unchanged" as const;
  return await adjustCounter(sessionKey, counterId, value - counter.value) ? "saved" as const : "invalid" as const;
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

export async function startSecretWord(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const blocked = checkChatGame(sessionKey);
  if (blocked) return fail(blocked);
  const started = startNextSecretWordByKey(sessionKey);
  if (started.kind === "empty") return fail("secret_queue_empty");
  if (started.kind === "already_active") return fail("already_active");
  await announce(sessionKey, [
    `[비밀 단어] 찾기 시작!
채팅 속에 숨은 비밀 단어(${started.length}글자)를 먼저 말한 분이 이겨요.`,
  ]);
  return { ok: true, status: "started" };
}

export async function revealSecretWordHint(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const active = getActiveSecretWordByKey(sessionKey);
  if (!active) return fail("not_active");
  await announce(sessionKey, [active.hint ? `[비밀 단어] 힌트: ${active.hint}` : "[비밀 단어] 이번 단어는 힌트가 없어요."]);
  return { ok: true, status: "hint_sent" };
}

export async function finishSecretWord(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const round = finishSecretWordByKey(sessionKey);
  if (!round) return fail("not_active");
  await announce(sessionKey, [`[비밀 단어] 아무도 찾지 못했어요. 비밀 단어: ${round.word}`]);
  return { ok: true, status: "finished" };
}

// Called by the bot runtime when a listener's chat message found the word.
export function announceSecretWordFound(sessionKey: string, round: { word: string; winnerNickname: string | null; startedAt: number; foundAt: number | null }) {
  const elapsed = formatDuration((round.foundAt ?? Date.now()) - round.startedAt);
  void announce(sessionKey, [
    `[비밀 단어] ${round.winnerNickname ?? "청취자"}님이 비밀 단어를 찾았어요! 정답: ${round.word} (${elapsed} 만에)`,
  ]);
}

const METRIC_LABELS: Record<TeamBattleMetric, string> = {
  hearts: "하트가",
  spoons: "후원(스푼)이",
  both: `하트와 후원이(스푼 1개 = ${SPOON_POINTS_IN_BOTH}점)`,
};

function formatTeamScores(teams: TeamScore[]) {
  return teams.map((team) => `${team.name} ${team.score.toLocaleString("ko-KR")}`).join(" : ");
}

function teamBattleResultMessages(battle: TeamBattle) {
  const ranked = [...battle.teams].sort((left, right) => right.score - left.score);
  const ranking = ranked.map((team, index) => `${index + 1}위 ${team.name} ${team.score.toLocaleString("ko-KR")}점`).join(" · ");
  const mvp = battle.topMembers[0];
  const messages = [`[팀 대항전] 종료! ${battle.winnerIndex === null ? "무승부 · " : ""}${ranking}`];
  if (mvp) messages.push(`[팀 대항전] MVP: ${mvp.nickname}님(${battle.teams[mvp.teamIndex]?.name ?? ""}) ${mvp.points.toLocaleString("ko-KR")}점`);
  return messages;
}

export async function startTeamBattle(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const blocked = checkChatGame(sessionKey);
  if (blocked) return fail(blocked);
  const started = startTeamBattleByKey(sessionKey);
  if (started.kind === "already_active") return fail("already_active");
  const { teamNames, metric, goal } = started.settings;
  const choices = teamNames.map((name, index) => `'!팀 ${index + 1}'(${name})`).join(" / ");
  await announce(sessionKey, [
    `[팀 대항전] 시작! 채팅에 ${choices}로 팀을 골라 주세요. 참여 후 보낸 ${METRIC_LABELS[metric]} 팀 점수가 돼요.${goal > 0 ? ` 먼저 ${goal.toLocaleString("ko-KR")}점 달성한 팀이 이겨요.` : ""}`,
  ]);
  return { ok: true, status: "started" };
}

export async function announceTeamBattleStatus(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const battle = getActiveTeamBattleByKey(sessionKey);
  if (!battle) return fail("not_active");
  const members = battle.teams.reduce((sum, team) => sum + team.members, 0);
  await announce(sessionKey, [`[팀 대항전] 현재 점수: ${formatTeamScores(battle.teams)} (참여 ${members.toLocaleString("ko-KR")}명)`]);
  return { ok: true, status: "status_sent" };
}

export async function finishTeamBattle(sessionKey: string): Promise<LiveActionResult> {
  sessionKey = botSessionOf(sessionKey);
  const battle = finishTeamBattleByKey(sessionKey);
  if (!battle) return fail("not_active");
  flushGameAcks(sessionKey, "team");
  await announce(sessionKey, teamBattleResultMessages(battle));
  return { ok: true, status: "finished" };
}

// Called by the bot runtime after hearts/donations changed team scores.
export function announceTeamBattleOutcome(sessionKey: string, outcome: TeamBattleOutcome) {
  if (outcome.kind === "lead_change") {
    void announce(sessionKey, [`[팀 대항전] 역전! ${outcome.leader.name} 선두 (${formatTeamScores(outcome.battle.teams)})`]);
    return;
  }
  flushGameAcks(sessionKey, "team");
  void announce(sessionKey, [
    `[팀 대항전] ${outcome.winner.name} 승리! 목표 ${outcome.battle.goal.toLocaleString("ko-KR")}점을 먼저 달성했어요.`,
    ...teamBattleResultMessages(outcome.battle),
  ]);
}

export function setRouletteEnabled(sessionKey: string, enabled: boolean) {
  const current = getRouletteSettingsByKey(sessionKey);
  updateRouletteSettingsByKey(sessionKey, { ...current, enabled });
}

export function setAutomationEnabled(sessionKey: string, feature: AutomationFeature, enabled: boolean) {
  const current = getBotSettingsByKey(sessionKey);
  updateBotSettingsByKey(sessionKey, {
    ...current,
    ...(feature === "welcome" && { welcomeEnabled: enabled }),
    ...(feature === "donation" && { donationEnabled: enabled }),
    ...(feature === "heart" && { heartEnabled: enabled }),
    ...(feature === "repeat" && { repeatEnabled: enabled }),
    ...(feature === "follow" && { followEnabled: enabled }),
  });
}

function onOff(enabled: boolean) {
  return enabled ? "ON" : "OFF";
}

export function formatLiveStatus(sessionKey: string) {
  const rps = getRpsRoundByKey(sessionKey);
  const raffle = getRaffleRoundByKey(sessionKey);
  const quiz = getQuizRoundByKey(sessionKey);
  const games = [
    rps?.active && `가위바위보(${rps.entries.length}명)`,
    raffle?.active && `추첨(${raffle.entries.length}명)`,
    quiz?.active && `퀴즈(${quiz.submissions.length}명)`,
    getActiveSecretWordByKey(sessionKey) && "비밀 단어",
    getActiveTeamBattleByKey(sessionKey) && "팀 대항전",
  ].filter(Boolean);
  const settings = getBotSettingsByKey(sessionKey);
  const roulette = getRouletteSettingsByKey(sessionKey);
  return [
    `[봇 상태] 진행 중: ${games.length > 0 ? games.join(", ") : "없음"} · 대기 퀴즈 ${listQuizQueueByKey(sessionKey).length}개 · 대기 비밀 단어 ${listSecretWordQueueByKey(sessionKey).length}개`,
    `룰렛 ${onOff(roulette.enabled)} · 입장 환영 ${onOff(settings.welcomeEnabled)} · 후원 감사 ${onOff(settings.donationEnabled)} · 하트 감사 ${onOff(settings.heartEnabled)} · 팔로우 감사 ${onOff(settings.followEnabled)} · 반복 공지 ${onOff(settings.repeatEnabled)}`,
  ];
}

async function replyResult(sessionKey: string, result: LiveActionResult) {
  if (!result.ok) await sendBotChat(sessionKey, FAILURE_REPLIES[result.status]);
}

export async function runDjCommand(sessionKey: string, command: DjCommand) {
  switch (command.kind) {
    case "help":
      await announce(sessionKey, formatMultilineMessages("[DJ 명령어]", "[DJ 명령어] (이어서)", DJ_COMMAND_HELP));
      return;
    case "status":
      await announce(sessionKey, formatLiveStatus(sessionKey));
      return;
    case "usage":
      await sendBotChat(sessionKey, command.usage);
      return;
    case "rps_start":
      return replyResult(sessionKey, await startRps(sessionKey));
    case "rps_finish":
      return replyResult(sessionKey, await finishRps(sessionKey));
    case "raffle_start":
      return replyResult(sessionKey, await startRaffle(sessionKey, command.winnerCount));
    case "raffle_finish":
      return replyResult(sessionKey, await finishRaffle(sessionKey));
    case "quiz_start":
      return replyResult(sessionKey, await startNextQuiz(sessionKey));
    case "quiz_finish":
      return replyResult(sessionKey, await finishQuiz(sessionKey));
    case "secret_start":
      return replyResult(sessionKey, await startSecretWord(sessionKey));
    case "secret_hint":
      return replyResult(sessionKey, await revealSecretWordHint(sessionKey));
    case "secret_finish":
      return replyResult(sessionKey, await finishSecretWord(sessionKey));
    case "team_start":
      return replyResult(sessionKey, await startTeamBattle(sessionKey));
    case "team_status":
      return replyResult(sessionKey, await announceTeamBattleStatus(sessionKey));
    case "team_finish":
      return replyResult(sessionKey, await finishTeamBattle(sessionKey));
    case "roulette_toggle":
      setRouletteEnabled(sessionKey, command.enabled);
      await sendBotChat(sessionKey, command.enabled
        ? `[룰렛] 지금부터 ${getRouletteSettingsByKey(sessionKey).cost.toLocaleString("ko-KR")}스푼 이상 후원하면 룰렛이 돌아가요!`
        : "[룰렛] 룰렛을 잠시 멈출게요.");
      return;
    case "automation_toggle":
      setAutomationEnabled(sessionKey, command.feature, command.enabled);
      await sendBotChat(
        sessionKey,
        `${AUTOMATION_LABELS[command.feature]} 기능을 ${command.enabled ? "켰어요" : "껐어요"}.`,
      );
      return;
  }
}
