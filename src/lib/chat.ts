import "server-only";

import { getBotAuthSession } from "./auth";
import { truncateChatMessage, validateChatMessage, type ChatValidationError } from "./chat-message";
import { getSessionKey, getWorkspaceBotSessionKey } from "./session-store";
import { getSpoonConfig, parseRetryAfter } from "./spoon";

export type ChatSendResult =
  | { kind: "sent" }
  | { kind: ChatValidationError }
  | {
    kind:
      | "authentication_required"
      | "missing_scope"
      | "chat_blocked"
      | "bot_blocked"
      | "offline"
      | "rate_limited"
      | "daily_limited"
      | "unavailable";
  };

const globalForChat = globalThis as typeof globalThis & {
  naguChatQueues?: Map<string, Promise<ChatSendResult>>;
  naguRecentlySentChats?: Map<string, Array<{ text: string; at: number }>>;
};

const chatQueues = globalForChat.naguChatQueues ?? new Map<string, Promise<ChatSendResult>>();
globalForChat.naguChatQueues = chatQueues;
const recentlySent = globalForChat.naguRecentlySentChats ?? new Map<string, Array<{ text: string; at: number }>>();
globalForChat.naguRecentlySentChats = recentlySent;

async function readDetailCode(response: Response) {
  const body = await response.json().catch(() => null) as { detailCode?: string } | null;
  return body?.detailCode;
}

async function sendChatRequest(accessToken: string, message: string): Promise<ChatSendResult> {
  let response: Response;
  try {
    response = await fetch(`${getSpoonConfig().baseUrl}/v1/live/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: message.trim() }),
      cache: "no-store",
      // A stalled send would block the serial queue (greetings, results) behind it.
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { kind: "unavailable" };
  }

  if (response.status === 204) return { kind: "sent" };
  if (response.status === 401) return { kind: "authentication_required" };
  if (response.status === 404) return { kind: "offline" };
  if (response.status === 429) {
    // With Retry-After it is the daily limit: retrying today is pointless.
    return { kind: parseRetryAfter(response) ? "daily_limited" : "rate_limited" };
  }

  const detailCode = await readDetailCode(response);
  if (response.status === 400 && detailCode === "OAPI_MNGR_0108") {
    return { kind: "invalid_message" };
  }
  if (response.status === 400 && detailCode === "OAPI_MNGR_0109") {
    return { kind: "message_too_long" };
  }
  if (response.status === 403 && detailCode === "OAPI_MNGR_0208") {
    return { kind: "chat_blocked" };
  }
  if (response.status === 403 && detailCode === "OAPI_MNGR_0209") {
    return { kind: "bot_blocked" };
  }
  if (response.status === 403) return { kind: "missing_scope" };
  return { kind: "unavailable" };
}

const RATE_LIMIT_RETRY_DELAYS_MS = [1_000, 2_000];

async function sendChatBySessionKey(sessionKey: string, message: string): Promise<ChatSendResult> {
  const validationError = validateChatMessage(message);
  if (validationError) return { kind: validationError };

  let session = await getBotAuthSession(sessionKey);
  if (!session) return { kind: "authentication_required" };
  if (!session.scope.split(" ").includes("chat.send")) return { kind: "missing_scope" };

  let result = await sendChatRequest(session.access_token, message);
  if (result.kind === "authentication_required") {
    session = await getBotAuthSession(sessionKey, true);
    if (!session) return result;
    result = await sendChatRequest(session.access_token, message);
  }
  // Spoon's chat limit is shared by the whole room, so a busy broadcast can
  // reject the bot briefly; retry a couple of times instead of dropping
  // greetings and game results.
  for (const delayMs of RATE_LIMIT_RETRY_DELAYS_MS) {
    if (result.kind !== "rate_limited") break;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await sendChatRequest(session.access_token, message);
  }
  return result;
}

const SENT_ECHO_WINDOW_MS = 30_000;

function rememberSentMessage(sessionKey: string, message: string) {
  const now = Date.now();
  const sent = (recentlySent.get(sessionKey) ?? [])
    .filter((entry) => now - entry.at < SENT_ECHO_WINDOW_MS);
  sent.push({ text: message.trim(), at: now });
  recentlySent.set(sessionKey, sent.slice(-50));
}

// Messages are sent with the DJ's token, so if Spoon echoes them back as DJ chat
// the runtime must not treat them as DJ commands.
export function isRecentBotMessage(sessionKey: string, message: string) {
  const now = Date.now();
  const text = message.trim();
  return (recentlySent.get(sessionKey) ?? [])
    .some((entry) => entry.text === text && now - entry.at < SENT_ECHO_WINDOW_MS);
}

function enqueueChat(sessionKey: string, message: string) {
  const previous = chatQueues.get(sessionKey) ?? Promise.resolve<ChatSendResult>({ kind: "sent" });
  const queued = previous
    .catch(() => ({ kind: "unavailable" }) as ChatSendResult)
    .then(async () => {
      try {
        const result = await sendChatBySessionKey(sessionKey, message);
        if (result.kind === "sent") rememberSentMessage(sessionKey, message);
        return result;
      } catch {
        return { kind: "unavailable" } as ChatSendResult;
      }
    });

  chatQueues.set(sessionKey, queued);
  void queued.finally(() => {
    if (chatQueues.get(sessionKey) === queued) chatQueues.delete(sessionKey);
  }).catch(() => undefined);
  return queued;
}

export function sendChat(sessionId: string, message: string) {
  const sessionKey = getSessionKey(sessionId);
  return enqueueChat(getWorkspaceBotSessionKey(sessionKey) ?? sessionKey, message);
}

export function sendBotChat(sessionKey: string, message: string) {
  return enqueueChat(sessionKey, truncateChatMessage(message));
}