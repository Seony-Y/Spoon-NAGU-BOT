import "server-only";

import { getBotAuthSession } from "./auth";
import { validateChatMessage, type ChatValidationError } from "./chat-message";
import { getSessionKey } from "./session-store";
import { getSpoonConfig } from "./spoon";

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
      | "unavailable";
  };

const globalForChat = globalThis as typeof globalThis & {
  naguChatQueues?: Map<string, Promise<ChatSendResult>>;
};

const chatQueues = globalForChat.naguChatQueues ?? new Map<string, Promise<ChatSendResult>>();
globalForChat.naguChatQueues = chatQueues;

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
    });
  } catch {
    return { kind: "unavailable" };
  }

  if (response.status === 204) return { kind: "sent" };
  if (response.status === 401) return { kind: "authentication_required" };
  if (response.status === 404) return { kind: "offline" };
  if (response.status === 429) return { kind: "rate_limited" };

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

async function sendChatBySessionKey(sessionKey: string, message: string): Promise<ChatSendResult> {
  const validationError = validateChatMessage(message);
  if (validationError) return { kind: validationError };

  let session = await getBotAuthSession(sessionKey);
  if (!session) return { kind: "authentication_required" };
  if (!session.scope.split(" ").includes("chat.send")) return { kind: "missing_scope" };

  let result = await sendChatRequest(session.access_token, message);
  if (result.kind !== "authentication_required") return result;

  session = await getBotAuthSession(sessionKey, true);
  if (!session) return result;
  result = await sendChatRequest(session.access_token, message);
  return result;
}

function enqueueChat(sessionKey: string, message: string) {
  const previous = chatQueues.get(sessionKey) ?? Promise.resolve<ChatSendResult>({ kind: "sent" });
  const queued = previous
    .catch(() => ({ kind: "unavailable" }) as ChatSendResult)
    .then(() => sendChatBySessionKey(sessionKey, message));

  chatQueues.set(sessionKey, queued);
  void queued.finally(() => {
    if (chatQueues.get(sessionKey) === queued) chatQueues.delete(sessionKey);
  });
  return queued;
}

export function sendChat(sessionId: string, message: string) {
  return enqueueChat(getSessionKey(sessionId), message);
}

export function sendBotChat(sessionKey: string, message: string) {
  return enqueueChat(sessionKey, message);
}