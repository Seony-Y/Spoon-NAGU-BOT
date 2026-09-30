import "server-only";

import { getBotAuthSession } from "./auth";
import {
  createBotAutomationState,
  processBotAutomation,
  resetBotAutomationState,
  type BotActivity,
} from "./bot-automation";
import { sendBotChat } from "./chat";
import {
  findBotCommandResponse,
  getBotSettingsByKey,
  getSessionKey,
  isSessionBlockedByKey,
  isBotEnabled,
  listEnabledBotSessions,
  setBotEnabled,
  setBotEnabledByKey,
  updateDjNicknameByKey,
} from "./session-store";
import { getCurrentLive, getSpoonConfig, SpoonApiErrorResponse } from "./spoon";
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
];
const OFFLINE_RETRY_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_EVENTS = 50;
const STREAM_PERMISSION_REFRESH_MS = 60_000;
const HOURLY_ANNOUNCEMENT_MS = 60 * 60 * 1000;

export type BotConnectionState =
  | "stopped"
  | "starting"
  | "waiting"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "authentication_required"
  | "permission_required"
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
  hourlyTimer?: ReturnType<typeof setTimeout>;
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

function clearBroadcastState(runtime: BotRuntime) {
  resetBotAutomationState(runtime);
  runtime.favoriteListeners.clear();
  runtime.currentLiveId = undefined;
  runtime.managerEventsConfirmed = false;
  if (runtime.hourlyTimer) clearTimeout(runtime.hourlyTimer);
  runtime.hourlyTimer = undefined;
}

function scheduleHourlyAnnouncement(sessionKey: string, runtime: BotRuntime) {
  if (runtime.hourlyTimer) clearTimeout(runtime.hourlyTimer);

  const announce = () => {
    if (runtime.currentLiveId === undefined) return;
    if (runtime.state === "connected") {
      const settings = getBotSettingsByKey(sessionKey);
      if (settings.hourlyEnabled) {
        const message = settings.hourlyMessage.replaceAll("{name}", settings.djNickname || "DJ");
        if (message) void sendBotChat(sessionKey, message.slice(0, 200));
      }
    }
    runtime.hourlyTimer = setTimeout(announce, HOURLY_ANNOUNCEMENT_MS);
    runtime.hourlyTimer.unref();
  };

  runtime.hourlyTimer = setTimeout(announce, HOURLY_ANNOUNCEMENT_MS);
  runtime.hourlyTimer.unref();
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();

    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
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
    updateDjNicknameByKey(sessionKey, event.data.user.nickname);
  }

  const settings = getBotSettingsByKey(sessionKey);
  const reply = event.event === "chat"
    ? settings.commandsEnabled
      ? findBotCommandResponse(sessionKey, event.data.message, event.data.user.nickname)
      : null
    : processBotAutomation(runtime, event, settings);
  if (reply) void sendBotChat(sessionKey, reply.slice(0, 200));
}

export async function consumeEventStream(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: ParsedSseEvent) => void,
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
    } catch {
      if (signal.aborted) return;
      setRuntimeState(sessionKey, "reconnecting");
      await abortableDelay(nextBackoff(retryAttempt), signal);
      retryAttempt += 1;
      continue;
    }
    forceRefresh = false;
    if (!session) {
      setRuntimeState(sessionKey, "authentication_required");
      setBotEnabledByKey(sessionKey, false);
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
        if (runtime?.currentLiveId !== undefined) clearBroadcastState(runtime);
        retriedUnauthorized = false;
        retryAttempt = 0;
        setRuntimeState(sessionKey, "waiting");
        await abortableDelay(OFFLINE_RETRY_MS, signal);
        continue;
      }
      if (runtime && runtime.currentLiveId !== live.liveId) {
        clearBroadcastState(runtime);
        runtime.currentLiveId = live.liveId;
        scheduleHourlyAnnouncement(sessionKey, runtime);
      }

      const streamSignal = runtime?.managerEventsConfirmed
        ? signal
        : AbortSignal.any([signal, AbortSignal.timeout(STREAM_PERMISSION_REFRESH_MS)]);
      const response = await fetch(`${getSpoonConfig().baseUrl}/v1/live/events`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: "text/event-stream",
        },
        cache: "no-store",
        signal: streamSignal,
      });

      if (response.status === 401) {
        if (retriedUnauthorized) {
          setRuntimeState(sessionKey, "authentication_required");
          setBotEnabledByKey(sessionKey, false);
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
      }

      const reason = await consumeEventStream(response.body, streamSignal, (event) => {
        recordEvent(sessionKey, event);
      });

      if (signal.aborted) return;
      if (streamSignal.aborted) continue;
      if (reason === "RECONNECT") continue;
      if (reason === "TOKEN_EXPIRED") {
        forceRefresh = true;
        continue;
      }

      if (reason === "LIVE_ENDED") {
        const endedRuntime = runtimes.get(sessionKey);
        if (endedRuntime) clearBroadcastState(endedRuntime);
        setRuntimeState(sessionKey, "waiting");
        await abortableDelay(OFFLINE_RETRY_MS, signal);
        continue;
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof SpoonApiErrorResponse && error.status === 401) {
        if (retriedUnauthorized) {
          setRuntimeState(sessionKey, "authentication_required");
          setBotEnabledByKey(sessionKey, false);
          return;
        }
        retriedUnauthorized = true;
        forceRefresh = true;
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
    }

    setRuntimeState(sessionKey, "reconnecting");
    await abortableDelay(nextBackoff(retryAttempt), signal);
    retryAttempt += 1;
  }
}

function startBotByKey(sessionKey: string) {
  const existing = runtimes.get(sessionKey);
  if (existing?.task && !existing.controller?.signal.aborted) return;
  if (existing?.hourlyTimer) clearTimeout(existing.hourlyTimer);

  const controller = new AbortController();
  const automation = createBotAutomationState();
  const runtime: BotRuntime = {
    enabled: true,
    state: "starting",
    events: existing?.events ?? [],
    activity: automation.activity,
    greetedUserIds: automation.greetedUserIds,
    announcedHeartMilestone: automation.announcedHeartMilestone,
    favoriteRanking: [],
    favoriteListeners: new Map(),
    managerEventsConfirmed: false,
    controller,
  };
  runtimes.set(sessionKey, runtime);

  runtime.task = runBot(sessionKey, controller.signal).finally(() => {
    if (runtime.hourlyTimer) clearTimeout(runtime.hourlyTimer);
    runtime.hourlyTimer = undefined;
    runtime.task = undefined;
    runtime.controller = undefined;
    if (controller.signal.aborted) runtime.state = "stopped";
  });
}

export function startBot(sessionId: string) {
  const sessionKey = getSessionKey(sessionId);
  if (!setBotEnabled(sessionId, true)) return false;
  startBotByKey(sessionKey);
  return true;
}

export function stopBot(sessionId: string) {
  setBotEnabled(sessionId, false);
  const runtime = runtimes.get(getSessionKey(sessionId));
  runtime?.controller?.abort();
  if (runtime?.hourlyTimer) clearTimeout(runtime.hourlyTimer);
  if (runtime) {
    runtime.enabled = false;
    runtime.state = "stopped";
  }
}

export function getBotSnapshot(sessionId: string): BotSnapshot {
  const enabled = isBotEnabled(sessionId);
  const runtime = runtimes.get(getSessionKey(sessionId));
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

  for (const { sessionKey, token } of listEnabledBotSessions()) {
    if (!hasEventScope(token.scope)) {
      setBotEnabledByKey(sessionKey, false);
      continue;
    }
    startBotByKey(sessionKey);
  }
}

export function blockBotByKey(sessionKey: string) {
  setBotEnabledByKey(sessionKey, false);
  const runtime = runtimes.get(sessionKey);
  runtime?.controller?.abort();
  if (runtime?.hourlyTimer) clearTimeout(runtime.hourlyTimer);
  if (runtime) {
    runtime.enabled = false;
    runtime.state = "blocked";
  }
}