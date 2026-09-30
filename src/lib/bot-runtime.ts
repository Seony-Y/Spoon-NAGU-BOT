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
import { getSpoonConfig } from "./spoon";
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
};

type BotRuntime = BotSnapshot & {
  controller?: AbortController;
  task?: Promise<void>;
  greetedUserIds: Set<string>;
  announcedHeartMilestone: number;
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
      const response = await fetch(`${getSpoonConfig().baseUrl}/v1/live/events`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          Accept: "text/event-stream",
        },
        cache: "no-store",
        signal,
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
      const runtime = runtimes.get(sessionKey);
      if (runtime) {
        runtime.state = "connected";
        runtime.connectedAt = new Date().toISOString();
      }

      const reason = await consumeEventStream(response.body, signal, (event) => {
        recordEvent(sessionKey, event);
      });

      if (signal.aborted) return;
      if (reason === "RECONNECT") continue;
      if (reason === "TOKEN_EXPIRED") {
        forceRefresh = true;
        continue;
      }

      if (reason === "LIVE_ENDED") {
        const endedRuntime = runtimes.get(sessionKey);
        if (endedRuntime) resetBotAutomationState(endedRuntime);
        setRuntimeState(sessionKey, "waiting");
        await abortableDelay(OFFLINE_RETRY_MS, signal);
        continue;
      }
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
    }

    setRuntimeState(sessionKey, "reconnecting");
    await abortableDelay(nextBackoff(retryAttempt), signal);
    retryAttempt += 1;
  }
}

function startBotByKey(sessionKey: string) {
  const existing = runtimes.get(sessionKey);
  if (existing?.task && !existing.controller?.signal.aborted) return;

  const controller = new AbortController();
  const automation = existing ?? createBotAutomationState();
  const runtime: BotRuntime = {
    enabled: true,
    state: "starting",
    events: existing?.events ?? [],
    activity: automation.activity,
    greetedUserIds: automation.greetedUserIds,
    announcedHeartMilestone: automation.announcedHeartMilestone,
    controller,
  };
  runtimes.set(sessionKey, runtime);

  runtime.task = runBot(sessionKey, controller.signal).finally(() => {
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
  if (runtime) {
    runtime.enabled = false;
    runtime.state = "blocked";
  }
}