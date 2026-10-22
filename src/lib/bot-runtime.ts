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
import { clearGameAcks, flushAllGameAcks, queueGameAck } from "./chat-acks";
import { formatMultilineMessages, resolveCommandFallback } from "./chat-message";
import { parseDjCommand } from "./dj-command";
import { announceSecretWordFound, runDjCommand } from "./live-actions";
import {
  applyBotCounterCommand,
  applyQuizCommand,
  applyRaffleCommand,
  applyRpsCommand,
  applyRouletteDonation,
  applyRouletteKeepCommand,
  applySecretWordChat,
  applySongRequestCommand,
  findBotCommandResponse,
  getAvailableCommandRepliesByKey,
  getBotSettingsByKey,
  getCurrentLiveIdByKey,
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
};

const globalForBots = globalThis as typeof globalThis & {
  naguBotRuntimes?: Map<string, BotRuntime>;
  naguBotRestoreStarted?: boolean;
};

const runtimes = globalForBots.naguBotRuntimes ?? new Map<string, BotRuntime>();
globalForBots.naguBotRuntimes = runtimes;

function hasEventScope(scope: string) {
  const scopes = scope.split(" ");
  return EVENT_SCOPES.some((eventScope) => scopes.includes(eventScope));
}

function setRuntimeState(sessionKey: string, state: BotConnectionState) {
  const runtime = runtimes.get(sessionKey);
  if (runtime) runtime.state = state;
}

function clearBroadcastState(sessionKey: string, runtime: BotRuntime) {
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
async function backfillDonations(sessionKey: string, accessToken: string, liveId: number) {
  const donations = await getAllLiveDonations(accessToken);
  const runtime = runtimes.get(sessionKey);
  if (!runtime || runtime.currentLiveId !== liveId) return;
  const recovered: SpoonDonation[] = [];
  for (const donation of donations) {
    const event = {
      event: "donation" as const,
      id: `donation:${donation.user.id}:${donation.time}`,
      data: { user: donation.user, amount: donation.amount, message: null, time: donation.time },
    };
    if (!recordAudienceEvent(sessionKey, liveId, event)) continue;
    runtime.activity.spoons += donation.amount;
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

function recordEvent(sessionKey: string, event: ParsedSseEvent) {
  if (event.event === "end") return;

  const runtime = runtimes.get(sessionKey);
  if (!runtime) return;

  const receivedAt = new Date().toISOString();
  runtime.lastEventAt = receivedAt;
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

  const settings = getBotSettingsByKey(sessionKey);
  let reply: string | null;
  if (event.event === "chat") {
    if (event.data.isDj && isRecentBotMessage(sessionKey, event.data.message)) return;
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
      Number.isNaN(Date.parse(event.data.sentTime)) ? Date.now() : Date.parse(event.data.sentTime),
    );
    if (foundSecret) announceSecretWordFound(sessionKey, foundSecret);
    const command = event.data.message.trim().toLocaleLowerCase("ko-KR");
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
    const songRequestReply = applySongRequestCommand(
      sessionKey,
      event.data.message,
      event.data.isDj,
      event.data.user.nickname,
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
    reply = keepReply ?? quizReply ?? raffleReply ?? rpsReply ?? songRequestReply ?? counterReply ?? fallbackReply;
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

    try {
      const live = await getCurrentLive(session.access_token);
      const runtime = runtimes.get(sessionKey);
      if (!live) {
        if (runtime?.currentLiveId !== undefined) clearBroadcastState(sessionKey, runtime);
        retriedUnauthorized = false;
        retryAttempt = 0;
        setRuntimeState(sessionKey, "waiting");
        await abortableDelay(OFFLINE_RETRY_MS, signal);
        continue;
      }
      if (signal.aborted) return;
      if (runtime && runtime.currentLiveId !== live.liveId) {
        clearBroadcastState(sessionKey, runtime);
        runtime.currentLiveId = live.liveId;
        setCurrentLiveIdByKey(sessionKey, live.liveId);
        scheduleRepeatAnnouncements(sessionKey, runtime);
      } else if (runtime && !runtime.repeatTimer) {
        // Restored mid-broadcast (restart, deploy, leave/join): resume announcements.
        scheduleRepeatAnnouncements(sessionKey, runtime);
      }

      const streamSignal = runtime?.managerEventsConfirmed
        ? signal
        : AbortSignal.any([signal, AbortSignal.timeout(STREAM_PERMISSION_REFRESH_MS)]);
      const idleController = new AbortController();
      const connectionSignal = AbortSignal.any([streamSignal, idleController.signal]);
      const response = await fetch(`${getSpoonConfig().baseUrl}/v1/live/events`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: "text/event-stream",
        },
        cache: "no-store",
        signal: connectionSignal,
      });

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

      retryAttempt = 0;
      if (runtime) {
        runtime.state = "connected";
        runtime.connectedAt = new Date().toISOString();
        if (runtime.needsDonationBackfill && hasScope(session.scope, "donations.read")) {
          runtime.needsDonationBackfill = false;
          void backfillDonations(sessionKey, session.access_token, live.liveId).catch((error: unknown) => {
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
      if (reason === "RECONNECT") continue;
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
      const failedRuntime = runtimes.get(sessionKey);
      if (failedRuntime) failedRuntime.needsDonationBackfill = true;
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

function startBotByKey(sessionKey: string) {
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
    clearGameAcks(sessionKey);
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
  startBotByKey(sessionKey);
  return true;
}

export function ensureBotRunning(sessionId: string) {
  if (!isBotEnabled(sessionId)) return;
  startBotByKey(getSessionKey(sessionId));
}

// Stops the DJ's bot even when another of the DJ's devices is running it.
export function stopBot(sessionId: string) {
  const sessionKey = getSessionKey(sessionId);
  stopBotByKey(getWorkspaceBotSessionKey(sessionKey) ?? sessionKey);
}

export function suspendBotForAuthentication(sessionId: string) {
  const runtime = runtimes.get(getSessionKey(sessionId));
  runtime?.controller?.abort();
  if (runtime?.repeatTimer) clearTimeout(runtime.repeatTimer);
  if (runtime) runtime.state = "authentication_required";
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
  for (const { sessionKey, token } of sessions) {
    try {
      if (!hasEventScope(token.scope)) {
        setBotEnabledByKey(sessionKey, false);
        continue;
      }
      startBotByKey(sessionKey);
    } catch (error) {
      sendAlert(`restore:${sessionLabel(sessionKey)}`, `봇(${sessionLabel(sessionKey)})을 복원하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
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