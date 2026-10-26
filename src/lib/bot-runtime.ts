import "server-only";

import { sendAlert, sessionLabel } from "./alerts";
import { getBotAuthSession } from "./auth";
import {
  createBotAutomationState,
  createHeartBatcher,
  diffListenerSnapshot,
  fillDjName,
  formatHeartMessage,
  processBotAutomation,
  resetBotAutomationState,
  type BotActivity,
} from "./bot-automation";
import { isRecentBotMessage, sendBotChat } from "./chat";
import { clearGameAcks, flushAllGameAcks, flushGameAcks, queueGameAck } from "./chat-acks";
import { formatMultilineMessages, resolveCommandFallback, truncateChatMessage } from "./chat-message";
import { createCommandCooldown } from "./command-cooldown";
import { formatFundingReached } from "./counter-command";
import { parseDjCommand } from "./dj-command";
import { announceSecretWordFound, announceTeamBattleOutcome, runDjCommand } from "./live-actions";
import {
  applyBotCounterCommand,
  applyQuizCommand,
  applyRaffleCommand,
  applyRpsCommand,
  applyRouletteDonation,
  applyRouletteKeepCommand,
  addTeamBattlePoints,
  applyAttendanceCommand,
  addFundingSpoonsByKey,
  applySecretWordChat,
  attendanceMilestoneLabel,
  getAttendanceAnnounceByKey,
  markAttendanceByKey,
  recordBroadcastByKey,
  applyTeamCommand,
  finishSecretWordByKey,
  finishTeamBattleByKey,
  applySongRequestCommand,
  findBotCommandResponse,
  getAvailableCommandRepliesByKey,
  getBotSettingsByKey,
  getCurrentLiveIdByKey,
  getSessionDjUserIdByKey,
  getLatestAudienceLiveIdByKey,
  getLiveAutomationStateByKey,
  getRouletteKeepCommandRepliesByKey,
  getSessionKey,
  getWorkspaceBotSessionKey,
  isSessionBlockedByKey,
  isBotEnabled,
  isBotEnabledByKey,
  listOtherWorkspaceSessionKeys,
  clearRecentBotEventsByKey,
  listRecentBotEventsByKey,
  listEnabledBotSessions,
  recordRecentBotEventByKey,
  setBotEnabled,
  setBotEnabledByKey,
  linkDjWorkspaceByKey,
  recordAudienceEvent,
  setCurrentLiveIdByKey,
} from "./session-store";
import {
  getCurrentLive,
  getLiveDonationsPage,
  getLiveListenersPage,
  hasScope,
  getSpoonConfig,
  SpoonApiErrorResponse,
  type SpoonDonation,
  type SpoonListener,
} from "./spoon";
import {
  extractSseFrames,
  parseSseFrame,
  type ParsedSseEvent,
  type SpoonEventData,
  type SpoonEventName,
} from "./spoon-events";

const EVENT_SCOPES = [
  "events.chat",
  "events.presence",
  "events.like",
  "events.donation",
  "events.follow",
];
const OFFLINE_RETRY_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_EVENTS = 50;
const STREAM_PERMISSION_REFRESH_MS = 60_000;
const REPEAT_CHECK_MS = 60 * 1000;
const LISTENER_POLL_MS = 10_000;
// Spoon sends a `:heartbeat` comment about every 15 seconds; this much silence
// means a half-open connection that would otherwise look "connected".
const STREAM_IDLE_MS = 45_000;
// Waiting for the stream's response headers; the idle timer starts only after.
const STREAM_CONNECT_TIMEOUT_MS = 15_000;
// A stream must stay up this long before the reconnect backoff starts over.
const STABLE_STREAM_MS = 30_000;
const RECONNECT_JITTER_MS = 2_000;
// Spacing between bots restored at startup, so they do not hit Spoon at once.
const RESTORE_STAGGER_MS = 300;
const BACKFILL_SLACK_MS = 30_000;
const REFRESH_BACKFILL_INTERVAL_MS = 5 * 60_000;
const MAX_DAILY_LIMIT_WAIT_MS = 60 * 60 * 1000;
const RECONNECT_ALERT_ATTEMPTS = 5;

export type BotConnectionState =
  | "stopped"
  | "starting"
  | "waiting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "authentication_required"
  | "permission_required"
  | "duplicate_connection"
  | "blocked"
  | "error";

type RuntimeEventName = Exclude<SpoonEventName, "end">;

export type BotEvent = {
  [EventName in RuntimeEventName]: {
    id?: string;
    type: EventName;
    data: SpoonEventData[EventName];
    receivedAt: string;
  };
}[RuntimeEventName];

export type BotSnapshot = {
  enabled: boolean;
  state: BotConnectionState;
  connectedAt?: string;
  lastEventAt?: string;
  events: BotEvent[];
  activity: BotActivity;
  favoriteRanking: FavoriteRankingEntry[];
};

export type FavoriteRankingEntry = {
  id: string;
  nickname: string;
  favoriteTemperature: number;
  fanRank: number | null;
};

type BotRuntime = BotSnapshot & {
  controller?: AbortController;
  task?: Promise<void>;
  greetedUserIds: Set<string>;
  announcedHeartMilestone: number;
  favoriteListeners: Map<string, FavoriteRankingEntry>;
  currentLiveId?: number;
  managerEventsConfirmed: boolean;
  listenerIds: Set<string> | null;
  subscriberIds: Set<string>;
  repeatTimer?: ReturnType<typeof setTimeout>;
  lastRepeatAt?: number;
  heartBatcher: ReturnType<typeof createHeartBatcher>;
  // Set whenever the stream may have missed events (start, reconnect, new live).
  needsDonationBackfill: boolean;
  // Last moment the stream was known to be delivering (or 봇 입장 / a data
  // reset): donations before it were seen or are not the bot's to handle.
  donationsCoveredUntil: number;
  // Start of the oldest reconnect gap not yet recovered by a backfill.
  pendingBackfillFrom?: number;
  lastBackfillAt?: number;
};

const globalForBots = globalThis as typeof globalThis & {
  naguBotRuntimes?: Map<string, BotRuntime>;
  naguBotRestoreStarted?: boolean;
  naguCommandCooldown?: ReturnType<typeof createCommandCooldown>;
};

const runtimes = globalForBots.naguBotRuntimes ?? new Map<string, BotRuntime>();
globalForBots.naguBotRuntimes = runtimes;
const commandCooldown = globalForBots.naguCommandCooldown ?? createCommandCooldown();
globalForBots.naguCommandCooldown = commandCooldown;

function hasEventScope(scope: string) {
  const scopes = scope.split(" ");
  return EVENT_SCOPES.some((eventScope) => scopes.includes(eventScope));
}

function setRuntimeState(sessionKey: string, state: BotConnectionState) {
  const runtime = runtimes.get(sessionKey);
  if (runtime) runtime.state = state;
}

function clearBroadcastState(sessionKey: string, runtime: BotRuntime) {
  if (runtime.currentLiveId !== undefined) {
    finishTeamBattleByKey(sessionKey);
    finishSecretWordByKey(sessionKey);
  }
  resetBotAutomationState(runtime);
  runtime.lastEventAt = undefined;
  runtime.events = [];
  clearRecentBotEventsByKey(sessionKey);
  runtime.favoriteListeners.clear();
  runtime.currentLiveId = undefined;
  setCurrentLiveIdByKey(sessionKey, undefined);
  runtime.managerEventsConfirmed = false;
  runtime.listenerIds = null;
  if (runtime.repeatTimer) clearTimeout(runtime.repeatTimer);
  runtime.repeatTimer = undefined;
  runtime.lastRepeatAt = undefined;
  runtime.heartBatcher.clear();
  clearGameAcks(sessionKey);
  runtime.needsDonationBackfill = true;
}

function scheduleRepeatAnnouncements(sessionKey: string, runtime: BotRuntime) {
  if (runtime.repeatTimer) clearTimeout(runtime.repeatTimer);
  runtime.lastRepeatAt = Date.now();

  const announce = () => {
    if (runtime.currentLiveId === undefined) return;
    try {
      if (runtime.state === "connected") {
        const settings = getBotSettingsByKey(sessionKey);
        const interval = settings.repeatIntervalMinutes * 60 * 1000;
        if (settings.repeatEnabled && Date.now() - (runtime.lastRepeatAt ?? 0) >= interval) {
          const message = fillDjName(settings.repeatMessage, settings.djNickname);
          if (message) void sendBotChat(sessionKey, message);
          runtime.lastRepeatAt = Date.now();
        }
      }
    } catch (error) {
      console.error("Repeat announcement failed", error instanceof Error ? error.message : error);
    } finally {
      // Re-arm even after a failure, or announcements stop for the whole broadcast.
      runtime.repeatTimer = setTimeout(announce, REPEAT_CHECK_MS);
      runtime.repeatTimer.unref();
    }
  };

  runtime.repeatTimer = setTimeout(announce, REPEAT_CHECK_MS);
  runtime.repeatTimer.unref();
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();

    const onAbort = () => {
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function getAllLiveListeners(accessToken: string) {
  const listeners: SpoonListener[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await getLiveListenersPage(accessToken, cursor);
    listeners.push(...page.listeners);
    if (!page.nextCursor) break;
    if (seenCursors.has(page.nextCursor)) throw new Error("Repeated Spoon listener cursor");
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);

  return listeners;
}

async function pollListenerJoins(
  sessionKey: string,
  accessToken: string,
  signal: AbortSignal,
) {
  while (!signal.aborted) {
    try {
      const runtime = runtimes.get(sessionKey);
      if (!runtime || runtime.currentLiveId === undefined) return;
      const listeners = await getAllLiveListeners(accessToken);
      const { currentIds, joinedListeners } = diffListenerSnapshot(runtime.listenerIds, listeners);
      runtime.listenerIds = currentIds;
      runtime.subscriberIds = new Set(listeners.filter((listener) => listener.subscription).map((listener) => listener.id));
      const settings = getBotSettingsByKey(sessionKey);
      for (const listener of joinedListeners) {
        recordAttendance(sessionKey, runtime, listener);
        const reply = processBotAutomation(runtime, {
          event: "presence",
          data: {
            user: listener,
            type: "JOIN",
            fanRank: null,
            isManager: false,
            favoriteTemperature: null,
            time: new Date().toISOString(),
            subscribed: Boolean(listener.subscription),
          },
        }, settings);
        if (reply) void sendBotChat(sessionKey, reply);
      }
    } catch (error) {
      // The event stream stays up while listener snapshots retry on their own;
      // on Spoon's daily limit, pause polling until the reset.
      if (error instanceof SpoonApiErrorResponse && error.retryAfterMs) {
        await abortableDelay(Math.min(error.retryAfterMs, MAX_DAILY_LIMIT_WAIT_MS), signal);
      }
    }
    await abortableDelay(LISTENER_POLL_MS, signal);
  }
}

async function getAllLiveDonations(accessToken: string) {
  const donations: SpoonDonation[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await getLiveDonationsPage(accessToken, cursor);
    donations.push(...page.donations);
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) break;
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);
  return donations;
}

// Records donations received while the bot was away, runs the roulette for
// them, and thanks those donors in one message instead of one per donation.
async function backfillDonations(sessionKey: string, accessToken: string, liveId: number, from: number) {
  const donations = await getAllLiveDonations(accessToken);
  const runtime = runtimes.get(sessionKey);
  if (!runtime || runtime.currentLiveId !== liveId) return;
  // A little slack for clock differences; donations already recorded are skipped.
  const floor = from - BACKFILL_SLACK_MS;
  const recovered: SpoonDonation[] = [];
  for (const donation of donations) {
    const time = Date.parse(donation.time);
    if (!Number.isNaN(time) && time < floor) continue;
    const event = {
      event: "donation" as const,
      id: `donation:${donation.user.id}:${donation.time}`,
      data: { user: donation.user, amount: donation.amount, message: null, time: donation.time },
    };
    if (!recordAudienceEvent(sessionKey, liveId, event)) continue;
    recordAttendance(sessionKey, runtime, donation.user);
    runtime.activity.spoons += donation.amount;
    const donatedAt = Date.parse(donation.time);
    const teamOutcome = addTeamBattlePoints(
      sessionKey,
      donation.user.id,
      "spoons",
      donation.amount,
      Date.now(),
      Number.isNaN(donatedAt) ? Date.now() : donatedAt,
    );
    if (teamOutcome) announceTeamBattleOutcome(sessionKey, teamOutcome);
    addFundingSpoons(sessionKey, donation.amount);
    recovered.push(donation);
    const draw = applyRouletteDonation(sessionKey, liveId, event);
    if (draw) void sendBotChat(sessionKey, formatRouletteDraw(draw));
  }
  if (recovered.length === 0 || !getBotSettingsByKey(sessionKey).donationEnabled) return;
  for (const message of formatMultilineMessages(
    "[후원 감사] 봇이 잠시 자리를 비운 사이 후원해 주셔서 감사합니다!",
    "[후원 감사] (이어서)",
    recovered.map((donation) => `${donation.user.nickname.slice(0, 50)}님 ${donation.amount.toLocaleString("ko-KR")}스푼`),
  )) void sendBotChat(sessionKey, message);
}

function formatRouletteDraw(draw: NonNullable<ReturnType<typeof applyRouletteDonation>>) {
  return draw.isMiss
    ? `[룰렛] ${draw.nickname}님 아쉽게 꽝! 다음에 또 도전해 주세요.`
    : `[룰렛] ${draw.nickname}님 ${draw.itemLabel} 당첨! (보유 ${draw.keepCount}개)`;
}

function nextBackoff(attempt: number) {
  const base = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

async function readErrorDetail(response: Response) {
  const body = await response.text().catch(() => "");
  const eventData = body
    .split(/\r?\n/)
    .find((line) => line.startsWith("data:"))
    ?.slice(5)
    .trim();
  const payload = eventData || body;
  if (!payload) return undefined;

  try {
    return (JSON.parse(payload) as { detailCode?: string }).detailCode;
  } catch {
    return undefined;
  }
}

function recordAttendance(sessionKey: string, runtime: BotRuntime, user: { id: string; nickname: string | null }) {
  if (runtime.currentLiveId === undefined) return;
  const attended = markAttendanceByKey(sessionKey, runtime.currentLiveId, user.id, user.nickname);
  const milestone = attended && attendanceMilestoneLabel(attended);
  if (milestone && getAttendanceAnnounceByKey(sessionKey)) {
    void sendBotChat(sessionKey, `[출석] ${user.nickname?.trim() || "청취자"}님 ${milestone} 축하해요!`);
  }
}

// Funding counters that follow donations; a reached goal is announced once.
function addFundingSpoons(sessionKey: string, spoons: number) {
  for (const counter of addFundingSpoonsByKey(sessionKey, spoons)) {
    void sendBotChat(sessionKey, formatFundingReached(counter.name, counter.value, counter.goal));
  }
}

function recordEvent(sessionKey: string, event: ParsedSseEvent, { fromDashboard = false } = {}) {
  if (event.event === "end") return;

  const runtime = runtimes.get(sessionKey);
  if (!runtime) return;

  const receivedAt = new Date().toISOString();
  if (!fromDashboard) runtime.lastEventAt = receivedAt;
  runtime.events.unshift({
    id: event.id,
    type: event.event,
    data: event.data,
    receivedAt,
  } as BotEvent);
  runtime.events.splice(MAX_EVENTS);

  if (event.event === "presence" && event.data.favoriteTemperature !== null) {
    runtime.favoriteListeners ??= new Map();
    runtime.favoriteListeners.set(event.data.user.id, {
      id: event.data.user.id,
      nickname: event.data.user.nickname ?? "청취자",
      favoriteTemperature: event.data.favoriteTemperature,
      fanRank: event.data.fanRank,
    });
  }
  if (event.event === "presence") runtime.managerEventsConfirmed = true;

  if (event.event === "chat" && event.data.isDj && event.data.user.nickname) {
    linkDjWorkspaceByKey(sessionKey, event.data.user.id, event.data.user.nickname);
    // Linking may reveal a DJ an admin blocked from another session.
    if (isSessionBlockedByKey(sessionKey)) {
      blockBotByKey(sessionKey);
      return;
    }
  }
  recordRecentBotEventByKey(sessionKey, event, receivedAt);
  const isNewAudienceEvent = runtime.currentLiveId === undefined
    || recordAudienceEvent(sessionKey, runtime.currentLiveId, event);
  // A donation replayed after a reconnect was already thanked (and drawn).
  if (event.event === "donation" && !isNewAudienceEvent) return;
  if (!(event.event === "chat" && event.data.isDj)) recordAttendance(sessionKey, runtime, event.data.user);
  // Team battle points: only counted once per event (replays are not new).
  if (isNewAudienceEvent && (event.event === "like" || event.event === "donation")) {
    const outcome = event.event === "like"
      ? addTeamBattlePoints(sessionKey, event.data.user.id, "hearts", event.data.totalAmount)
      : addTeamBattlePoints(sessionKey, event.data.user.id, "spoons", event.data.amount);
    if (outcome) announceTeamBattleOutcome(sessionKey, outcome);
  }
  if (isNewAudienceEvent && event.event === "donation" && runtime.currentLiveId !== undefined) {
    addFundingSpoons(sessionKey, event.data.amount);
  }

  const settings = getBotSettingsByKey(sessionKey);
  let reply: string | null;
  if (event.event === "chat") {
    // fromDashboard: the DJ's own message, which the echo guard has remembered.
    if (event.data.isDj && !fromDashboard && isRecentBotMessage(sessionKey, event.data.message)) return;
    const djCommand = event.data.isDj ? parseDjCommand(event.data.message) : null;
    if (djCommand) {
      void runDjCommand(sessionKey, djCommand).catch((error: unknown) => {
        console.error("DJ command failed", error instanceof Error ? error.message : error);
      });
      return;
    }
    // Does not consume the message: a found word may sit inside any chat.
    const foundSecret = applySecretWordChat(
      sessionKey,
      event.data.message,
      event.data.isDj,
      event.data.user.id,
      event.data.user.nickname,
      // Server time, like the round's start, so elapsed time is never negative.
      Date.now(),
    );
    if (foundSecret) announceSecretWordFound(sessionKey, foundSecret);
    if (!event.data.isDj && !commandCooldown.allow(sessionKey, event.data.user.id, event.data.message)) return;
    const command =event.data.message.trim().toLocaleLowerCase("ko-KR");
    const attendanceReply = applyAttendanceCommand(sessionKey, event.data.message, event.data.user.id, event.data.user.nickname, runtime.currentLiveId, event.data.isDj);
    if (attendanceReply) {
      void sendBotChat(sessionKey, attendanceReply);
      return;
    }
    if (command === "!명령어") {
      for (const message of getAvailableCommandRepliesByKey(sessionKey)) {
        void sendBotChat(sessionKey, message);
      }
      return;
    }
    const keepReplies = getRouletteKeepCommandRepliesByKey(
      sessionKey,
      event.data.message,
      event.data.user.id,
      event.data.user.nickname,
    );
    if (keepReplies) {
      for (const message of keepReplies) void sendBotChat(sessionKey, message);
      return;
    }
    const keepReply = applyRouletteKeepCommand(
      sessionKey,
      event.data.message,
      event.data.isDj,
    );
    const rpsReply = applyRpsCommand(
      sessionKey,
      event.data.message,
      event.data.isDj,
      event.data.user.id,
      event.data.user.nickname,
      (nickname) => queueGameAck(sessionKey, "rps", nickname),
    );
    const quizReply = applyQuizCommand(
      sessionKey,
      event.data.message,
      event.data.isDj,
      event.data.user.id,
      event.data.user.nickname,
      Number.isNaN(Date.parse(event.data.sentTime))
        ? Date.now()
        : Date.parse(event.data.sentTime),
      (nickname) => queueGameAck(sessionKey, "quiz", nickname),
    );
    const raffleReply = applyRaffleCommand(
      sessionKey,
      event.data.message,
      event.data.isDj,
      event.data.user.id,
      event.data.user.nickname,
      (nickname) => queueGameAck(sessionKey, "raffle", nickname),
    );
    const teamReply = applyTeamCommand(
      sessionKey,
      event.data.message,
      event.data.isDj,
      event.data.user.id,
      event.data.user.nickname,
      (nickname, teamName) => queueGameAck(sessionKey, "team", `${truncateChatMessage(nickname, 50)}→${teamName}`),
    );
    const songRequestReply = applySongRequestCommand(
      sessionKey,
      event.data.message,
      event.data.isDj,
      event.data.user.nickname,
      event.data.user.id,
    );
    if (Array.isArray(songRequestReply)) {
      for (const message of songRequestReply) void sendBotChat(sessionKey, message);
      return;
    }
    const counterReply = applyBotCounterCommand(sessionKey, event.data.message, event.data.isDj);
    const fallbackReply = resolveCommandFallback(
      event.data.message,
      event.data.user.nickname,
      findBotCommandResponse(sessionKey, event.data.message, event.data.user.nickname),
    );
    reply = keepReply ?? quizReply ?? raffleReply ?? teamReply ?? rpsReply ?? songRequestReply ?? counterReply ?? fallbackReply;
  } else {
    const enriched = event.event === "presence" && runtime.subscriberIds.has(event.data.user.id)
      ? { ...event, data: { ...event.data, subscribed: true } }
      : event;
    reply = processBotAutomation(runtime, enriched, settings);
    if (event.event === "like" && reply) {
      runtime.heartBatcher.add(event.data.user.id, event.data.user.nickname, event.data.totalAmount);
      reply = null;
    }
  }
  if (reply) void sendBotChat(sessionKey, reply);
  if (event.event === "donation" && runtime.currentLiveId !== undefined) {
    const draw = applyRouletteDonation(sessionKey, runtime.currentLiveId, event);
    if (draw) void sendBotChat(sessionKey, formatRouletteDraw(draw));
  }
}

export async function consumeEventStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: ParsedSseEvent) => void,
  onActivity?: () => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        return null;
      }
      onActivity?.();
      buffer += decoder.decode(value, { stream: true });

      const extracted = extractSseFrames(buffer);
      buffer = extracted.remainder;

      for (const frame of extracted.frames) {
        const event = parseSseFrame(frame);
        if (!event) continue;
        onEvent(event);

        if (event.event === "end") {
          return (event.data as SpoonEventData["end"]).reason;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return null;
}

async function runBot(sessionKey: string, signal: AbortSignal) {
  let retryAttempt = 0;
  let forceRefresh = false;
  let retriedUnauthorized = false;

  while (!signal.aborted) {
    if (isSessionBlockedByKey(sessionKey)) {
      setRuntimeState(sessionKey, "blocked");
      return;
    }
    setRuntimeState(sessionKey, "connecting");
    let session;
    try {
      session = await getBotAuthSession(sessionKey, forceRefresh);
      if (signal.aborted) return;
    } catch {
      if (signal.aborted) return;
      setRuntimeState(sessionKey, "reconnecting");
      await abortableDelay(nextBackoff(retryAttempt), signal);
      retryAttempt += 1;
      if (retryAttempt === RECONNECT_ALERT_ATTEMPTS) {
        sendAlert(`reconnect:${sessionLabel(sessionKey)}`, `봇(${sessionLabel(sessionKey)}) 재연결이 ${RECONNECT_ALERT_ATTEMPTS}번 연속 실패했습니다.`);
      }
      continue;
    }
    forceRefresh = false;
    if (!session) {
      setRuntimeState(sessionKey, "authentication_required");
      return;
    }

    if (!hasEventScope(session.scope)) {
      setRuntimeState(sessionKey, "permission_required");
      setBotEnabledByKey(sessionKey, false);
      return;
    }

    // Set when this connection is the periodic permission refresh (no gap).
    let permissionRefresh: AbortSignal | undefined;
    let streamOpenedAt: number | undefined;
    try {
      const live = await getCurrentLive(session.access_token);
      // Stopped while waiting: the map may already hold a newer bot's runtime.
      if (signal.aborted) return;
      const runtime = runtimes.get(sessionKey);
      if (!live) {
        if (runtime?.currentLiveId !== undefined) clearBroadcastState(sessionKey, runtime);
        retriedUnauthorized = false;
        retryAttempt = 0;
        setRuntimeState(sessionKey, "waiting");
        await abortableDelay(OFFLINE_RETRY_MS, signal);
        continue;
      }
      recordBroadcastByKey(sessionKey, live.liveId);
      if (runtime && runtime.currentLiveId !== live.liveId) {
        clearBroadcastState(sessionKey, runtime);
        runtime.currentLiveId = live.liveId;
        setCurrentLiveIdByKey(sessionKey, live.liveId);
        scheduleRepeatAnnouncements(sessionKey, runtime);
      } else if (runtime && !runtime.repeatTimer) {
        // Restored mid-broadcast (restart, deploy, leave/join): resume announcements.
        scheduleRepeatAnnouncements(sessionKey, runtime);
      }

      permissionRefresh = runtime?.managerEventsConfirmed ? undefined : AbortSignal.timeout(STREAM_PERMISSION_REFRESH_MS);
      const streamSignal = permissionRefresh ? AbortSignal.any([signal, permissionRefresh]) : signal;
      const idleController = new AbortController();
      const connectionSignal = AbortSignal.any([streamSignal, idleController.signal]);
      const connectTimer = setTimeout(() => idleController.abort(), STREAM_CONNECT_TIMEOUT_MS);
      const response = await fetch(`${getSpoonConfig().baseUrl}/v1/live/events`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: "text/event-stream",
        },
        cache: "no-store",
        signal: connectionSignal,
      }).finally(() => clearTimeout(connectTimer));

      if (response.status === 401) {
        if (retriedUnauthorized) {
          setRuntimeState(sessionKey, "authentication_required");
          return;
        }
        retriedUnauthorized = true;
        forceRefresh = true;
        continue;
      }

      retriedUnauthorized = false;

      if (response.status === 403) {
        const detailCode = await readErrorDetail(response);
        setRuntimeState(sessionKey, detailCode === "OAPI_MNGR_0209" ? "blocked" : "permission_required");
        setBotEnabledByKey(sessionKey, false);
        return;
      }

      if (response.status === 404) {
        retryAttempt = 0;
        setRuntimeState(sessionKey, "waiting");
        await abortableDelay(OFFLINE_RETRY_MS, signal);
        continue;
      }

      if (!response.ok || !response.body) {
        throw new Error(`Event stream failed with ${response.status}`);
      }

      streamOpenedAt = Date.now();
      if (runtime) {
        runtime.state = "connected";
        runtime.connectedAt = new Date().toISOString();
        // Every reconnect leaves a gap the stream will not replay; remember where
        // it started (before resetIdle moves the coverage mark to now). Real
        // drops are recovered at once; the minute-by-minute permission refresh
        // only leaves sub-second gaps, so those are swept every few minutes.
        runtime.pendingBackfillFrom = Math.min(runtime.pendingBackfillFrom ?? runtime.donationsCoveredUntil, runtime.donationsCoveredUntil);
        const backfillDue = runtime.needsDonationBackfill
          || Date.now() - (runtime.lastBackfillAt ?? 0) >= REFRESH_BACKFILL_INTERVAL_MS;
        if (backfillDue && hasScope(session.scope, "donations.read")) {
          const from = runtime.pendingBackfillFrom;
          runtime.needsDonationBackfill = false;
          runtime.lastBackfillAt = Date.now();
          void backfillDonations(sessionKey, session.access_token, live.liveId, from).then(() => {
            // Gaps opened while it ran stay pending for the next sweep.
            if (runtime.pendingBackfillFrom === from) runtime.pendingBackfillFrom = undefined;
          }).catch((error: unknown) => {
            runtime.needsDonationBackfill = true;
            console.error("Donation backfill failed", error instanceof Error ? error.message : error);
          });
        }
      }

      const listenerPollingController = new AbortController();
      const listenerPollingSignal = AbortSignal.any([streamSignal, listenerPollingController.signal]);
      const listenerPollingTask = session.scope.split(" ").includes("listeners.read")
        ? pollListenerJoins(sessionKey, session.access_token, listenerPollingSignal)
        : Promise.resolve();
      let reason;
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      const resetIdle = () => {
        if (runtime) runtime.donationsCoveredUntil = Date.now();
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => idleController.abort(), STREAM_IDLE_MS);
      };
      resetIdle();
      try {
        reason = await consumeEventStream(response.body, connectionSignal, (event) => {
          // A failure while handling one event must not tear down the stream.
          try {
            recordEvent(sessionKey, event);
          } catch (error) {
            console.error("Bot event handling failed", error instanceof Error ? error.message : error);
          }
        }, resetIdle);
      } finally {
        clearTimeout(idleTimer);
        listenerPollingController.abort();
        await listenerPollingTask;
      }
      // Only the periodic permission refresh reconnects without a gap.
      if (runtime && !streamSignal.aborted) runtime.needsDonationBackfill = true;

      if (signal.aborted) return;
      if (streamSignal.aborted) continue;
      // A stream that drops right after connecting (an overloaded or failing
      // gateway) keeps the backoff growing; resetting it on every connect let
      // each bot retry about once a second, all in step.
      const stable = Date.now() - streamOpenedAt >= STABLE_STREAM_MS;
      if (stable) retryAttempt = 0;
      if (reason === "RECONNECT" && stable) {
        // Spoon may ask every stream to reconnect at once; spread them out.
        await abortableDelay(Math.random() * RECONNECT_JITTER_MS, signal);
        continue;
      }
      if (reason === "TOKEN_EXPIRED") {
        forceRefresh = true;
        continue;
      }
      if (reason === "DUPLICATE_CONNECTION") {
        // Spoon allows one stream per app and DJ; a newer connection (another
        // session for the same DJ) took over, so reconnecting would ping-pong.
        setRuntimeState(sessionKey, "duplicate_connection");
        setBotEnabledByKey(sessionKey, false);
        return;
      }

      if (reason === "LIVE_ENDED") {
        const endedRuntime = runtimes.get(sessionKey);
        if (endedRuntime) clearBroadcastState(sessionKey, endedRuntime);
        setRuntimeState(sessionKey, "waiting");
        await abortableDelay(OFFLINE_RETRY_MS, signal);
        continue;
      }
    } catch (error) {
      if (signal.aborted) return;
      if (streamOpenedAt !== undefined && Date.now() - streamOpenedAt >= STABLE_STREAM_MS) retryAttempt = 0;
      const failedRuntime = runtimes.get(sessionKey);
      // The permission refresh ends the stream by timing out its read; that
      // reconnect has no gap, so it does not walk the donation list again.
      if (failedRuntime && !permissionRefresh?.aborted) failedRuntime.needsDonationBackfill = true;
      if (error instanceof SpoonApiErrorResponse && error.status === 401) {
        if (retriedUnauthorized) {
          setRuntimeState(sessionKey, "authentication_required");
          return;
        }
        retriedUnauthorized = true;
        forceRefresh = true;
        continue;
      }
      if (error instanceof SpoonApiErrorResponse && error.retryAfterMs) {
        // Daily limit: checking the live status again before the reset only
        // burns attempts. Re-check at most hourly in case the limit lifts.
        sendAlert("daily-limit", `Spoon 하루 API 한도에 도달했습니다. 약 ${Math.round(error.retryAfterMs / 60_000)}분 뒤 초기화됩니다.`);
        setRuntimeState(sessionKey, "reconnecting");
        await abortableDelay(Math.min(error.retryAfterMs, MAX_DAILY_LIMIT_WAIT_MS), signal);
        continue;
      }
      if (error instanceof SpoonApiErrorResponse && error.status === 403) {
        setRuntimeState(sessionKey, error.detailCode === "OAPI_MNGR_0209" ? "blocked" : "permission_required");
        setBotEnabledByKey(sessionKey, false);
        return;
      }
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
        continue;
      }
      console.error("Bot stream error; reconnecting", error instanceof Error ? error.message : error);
    }

    setRuntimeState(sessionKey, "reconnecting");
    await abortableDelay(nextBackoff(retryAttempt), signal);
    retryAttempt += 1;
    if (retryAttempt === RECONNECT_ALERT_ATTEMPTS) {
      sendAlert(`reconnect:${sessionLabel(sessionKey)}`, `봇(${sessionLabel(sessionKey)}) 재연결이 ${RECONNECT_ALERT_ATTEMPTS}번 연속 실패했습니다.`);
    }
  }
}

function startBotByKey(sessionKey: string, { joinedNow = false } = {}) {
  const existing = runtimes.get(sessionKey);
  if (existing?.task && !existing.controller?.signal.aborted) return;
  if (existing?.repeatTimer) clearTimeout(existing.repeatTimer);

  const controller = new AbortController();
  const automation = createBotAutomationState();
  const currentLiveId = existing?.currentLiveId
    ?? getCurrentLiveIdByKey(sessionKey)
    ?? getLatestAudienceLiveIdByKey(sessionKey);
  if (currentLiveId !== undefined) {
    const restored = getLiveAutomationStateByKey(sessionKey, currentLiveId);
    automation.activity = restored.activity;
    automation.greetedUserIds = new Set(restored.greetedUserIds);
  }
  const restoredEvents = existing?.events ?? listRecentBotEventsByKey(sessionKey) as BotEvent[];
  const runtime: BotRuntime = {
    enabled: true,
    state: "starting",
    events: restoredEvents,
    lastEventAt: restoredEvents[0]?.receivedAt,
    activity: automation.activity,
    greetedUserIds: automation.greetedUserIds,
    announcedHeartMilestone: automation.announcedHeartMilestone,
    favoriteRanking: [],
    favoriteListeners: new Map(),
    currentLiveId,
    managerEventsConfirmed: false,
    listenerIds: null,
    subscriberIds: new Set(),
    controller,
    needsDonationBackfill: true,
    // A DJ pressing 봇 입장 starts fresh; a restored bot recovers from its last event.
    donationsCoveredUntil: joinedNow
      ? Date.now()
      : existing?.donationsCoveredUntil ?? (restoredEvents[0] ? Date.parse(restoredEvents[0].receivedAt) : Date.now()),
    heartBatcher: createHeartBatcher(({ nickname, amount }) => {
      if (runtime.currentLiveId === undefined) return;
      try {
        const settings = getBotSettingsByKey(sessionKey);
        if (settings.heartEnabled) void sendBotChat(sessionKey, formatHeartMessage(settings, nickname, amount));
      } catch (error) {
        console.error("Heart thanks failed", error instanceof Error ? error.message : error);
      }
    }),
  };
  runtimes.set(sessionKey, runtime);

  runtime.task = runBot(sessionKey, controller.signal).catch((error: unknown) => {
    // e.g. a database error outside the reconnect loop's try: surface it instead
    // of leaving the dashboard stuck on "connecting".
    sendAlert(`worker:${sessionLabel(sessionKey)}`, `봇(${sessionLabel(sessionKey)})이 오류로 멈췄습니다: ${error instanceof Error ? error.message : String(error)}`);
    runtime.state = "error";
  }).finally(() => {
    if (runtime.repeatTimer) clearTimeout(runtime.repeatTimer);
    runtime.repeatTimer = undefined;
    runtime.heartBatcher.clear();
    // A bot restarted right after a stop already owns the session's acks.
    if (runtimes.get(sessionKey) === runtime) clearGameAcks(sessionKey);
    runtime.task = undefined;
    runtime.controller = undefined;
    // stop/suspend/block set a specific state when aborting; keep it.
    if (controller.signal.aborted && runtime.state !== "authentication_required" && runtime.state !== "blocked") {
      runtime.state = "stopped";
    }
  });
}

function stopBotByKey(sessionKey: string) {
  setBotEnabledByKey(sessionKey, false);
  const runtime = runtimes.get(sessionKey);
  runtime?.controller?.abort();
  if (runtime?.repeatTimer) clearTimeout(runtime.repeatTimer);
  if (runtime) {
    runtime.enabled = false;
    runtime.state = "stopped";
  }
}

export function startBot(sessionId: string) {
  const sessionKey = getSessionKey(sessionId);
  if (!setBotEnabled(sessionId, true)) return false;
  // One bot per DJ: the device that presses join takes the bot over from the
  // DJ's other sessions instead of fighting them for Spoon's single stream.
  for (const otherKey of listOtherWorkspaceSessionKeys(sessionKey)) stopBotByKey(otherKey);
  startBotByKey(sessionKey, { joinedNow: true });
  return true;
}

export function ensureBotRunning(sessionId: string) {
  if (!isBotEnabled(sessionId)) return;
  startBotByKey(getSessionKey(sessionId));
}

export const BOT_LEAVING_MESSAGE = "[NAGU BOT] 봇이 방송에서 나갔어요. 다시 들어올 때까지 명령어와 게임에 응답하지 않아요.";
const ANNOUNCE_TIMEOUT_MS = 5_000;

// Tells the broadcast the DJ's bot is in (if it is in one) about a change made
// from the dashboard. Waits for the send, at most a few seconds, so it goes out
// before the bot stops or the token is revoked.
export async function announceInLiveBroadcast(sessionId: string, message: string) {
  const sessionKey = getSessionKey(sessionId);
  const botKey = getWorkspaceBotSessionKey(sessionKey) ?? sessionKey;
  const runtime = runtimes.get(botKey);
  const inBroadcast = runtime?.state === "connected" || runtime?.state === "connecting" || runtime?.state === "reconnecting";
  if (!runtime?.enabled || !inBroadcast || runtime.currentLiveId === undefined) return;
  flushGameAcks(botKey);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    sendBotChat(botKey, message),
    new Promise((resolve) => { timer = setTimeout(resolve, ANNOUNCE_TIMEOUT_MS); }),
  ]);
  clearTimeout(timer);
}

// Spoon never echoes messages sent through the API, so a command the DJ types in
// the dashboard chat box (e.g. "!실드 +1", "!퀴즈 시작") would otherwise never
// run. It is handled here as the DJ's chat. Without a known DJ identity the
// nickname stays null, so it never links a workspace.
export function handleDashboardDjChat(sessionId: string, message: string) {
  const text = truncateChatMessage(message.trim());
  if (!text.startsWith("!")) return;
  const sessionKey = getSessionKey(sessionId);
  const botKey = getWorkspaceBotSessionKey(sessionKey) ?? sessionKey;
  const runtime = runtimes.get(botKey);
  if (!runtime?.enabled || runtime.currentLiveId === undefined) return;
  // The DJ's display name only with a known identity (a nickname links it).
  const djUserId = getSessionDjUserIdByKey(botKey);
  recordEvent(botKey, {
    event: "chat",
    data: {
      user: { id: djUserId ?? "dashboard-dj", nickname: djUserId ? getBotSettingsByKey(botKey).djNickname || null : null },
      isDj: true,
      message: text,
      sentTime: new Date().toISOString(),
    },
  }, { fromDashboard: true });
}

// After a data reset or restore: donations so far are not "missed" (their
// records may be gone on purpose), and acks for replaced games are dropped.
export function settleBotAfterDataChange(sessionId: string) {
  const sessionKey = getSessionKey(sessionId);
  const botKey = getWorkspaceBotSessionKey(sessionKey) ?? sessionKey;
  const runtime = runtimes.get(botKey);
  if (runtime) {
    runtime.donationsCoveredUntil = Date.now();
    runtime.pendingBackfillFrom = undefined;
  }
  clearGameAcks(botKey);
  // Keep the broadcast in progress counted for attendance streaks.
  const liveId = runtime?.currentLiveId ?? getCurrentLiveIdByKey(botKey);
  if (liveId !== undefined) recordBroadcastByKey(botKey, liveId);
}

// Stops the DJ's bot even when another of the DJ's devices is running it.
export function stopBot(sessionId: string) {
  const sessionKey = getSessionKey(sessionId);
  stopBotByKey(getWorkspaceBotSessionKey(sessionKey) ?? sessionKey);
}

// Disconnecting signs out every device of the DJ, so the bot stops wherever it
// runs (a bot on another device could no longer send anything).
export function suspendBotForAuthentication(sessionId: string) {
  const sessionKey = getSessionKey(sessionId);
  const botKey = getWorkspaceBotSessionKey(sessionKey);
  for (const key of new Set([sessionKey, botKey ?? sessionKey])) {
    const runtime = runtimes.get(key);
    runtime?.controller?.abort();
    if (runtime?.repeatTimer) clearTimeout(runtime.repeatTimer);
    if (runtime) runtime.state = "authentication_required";
  }
}

// Shows the DJ's bot even when another of the DJ's devices is running it.
export function getBotSnapshot(sessionId: string): BotSnapshot {
  const sessionKey = getSessionKey(sessionId);
  const botKey = getWorkspaceBotSessionKey(sessionKey) ?? sessionKey;
  const enabled = isBotEnabledByKey(botKey);
  const runtime = runtimes.get(botKey);
  return {
    enabled,
    state: runtime?.state ?? (enabled ? "starting" : "stopped"),
    connectedAt: runtime?.connectedAt,
    lastEventAt: runtime?.lastEventAt,
    events: runtime?.events.slice(0, 10) ?? [],
    activity: runtime?.activity ?? { hearts: 0, spoons: 0, welcomedListeners: 0 },
    favoriteRanking: runtime?.favoriteListeners
      ? [...runtime.favoriteListeners.values()]
        .sort((left, right) => right.favoriteTemperature - left.favoriteTemperature)
        .slice(0, 10)
      : [],
  };
}

// Bots with a live worker task in this process, for the metrics log.
export function countRunningBots() {
  let count = 0;
  for (const runtime of runtimes.values()) {
    if (runtime.task) count += 1;
  }
  return count;
}

export function restoreEnabledBots() {
  if (globalForBots.naguBotRestoreStarted) return;
  globalForBots.naguBotRestoreStarted = true;

  let sessions: ReturnType<typeof listEnabledBotSessions>;
  try {
    sessions = listEnabledBotSessions();
  } catch (error) {
    // Allow a later request to retry instead of never restoring in this process.
    globalForBots.naguBotRestoreStarted = false;
    sendAlert("restore", `서버 시작 시 봇을 복원하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  const failed = (sessionKey: string, error: unknown) => {
    sendAlert(`restore:${sessionLabel(sessionKey)}`, `봇(${sessionLabel(sessionKey)})을 복원하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  };
  let position = 0;
  for (const { sessionKey, token } of sessions) {
    try {
      if (!hasEventScope(token.scope)) {
        setBotEnabledByKey(sessionKey, false);
        continue;
      }
    } catch (error) {
      failed(sessionKey, error);
      continue;
    }
    // Staggered so a deploy does not send every bot's token refresh and first
    // requests to Spoon in the same second.
    const delay = position * RESTORE_STAGGER_MS + Math.random() * RESTORE_STAGGER_MS;
    position += 1;
    setTimeout(() => {
      try {
        // Stopped or blocked while waiting its turn.
        if (!isBotEnabledByKey(sessionKey)) return;
        startBotByKey(sessionKey);
      } catch (error) {
        failed(sessionKey, error);
      }
    }, delay);
  }
}

// On SIGTERM/SIGINT (deploys, restarts): queue pending heart thanks and game
// acknowledgements before the process exits, then close the streams. Bots stay
// enabled in the database, so the next process restores them.
export function shutdownBots() {
  for (const runtime of runtimes.values()) runtime.heartBatcher.flush();
  flushAllGameAcks();
  for (const runtime of runtimes.values()) {
    if (runtime.repeatTimer) clearTimeout(runtime.repeatTimer);
    runtime.controller?.abort();
  }
}

export function blockBotByKey(sessionKey: string) {
  setBotEnabledByKey(sessionKey, false);
  const runtime = runtimes.get(sessionKey);
  runtime?.controller?.abort();
  if (runtime?.repeatTimer) clearTimeout(runtime.repeatTimer);
  if (runtime) {
    runtime.enabled = false;
    runtime.state = "blocked";
  }
}