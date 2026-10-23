import "server-only";

import { createAckBatcher } from "./bot-automation";
import { sendBotChat } from "./chat";
import { truncateChatMessage } from "./chat-message";

// Batched acknowledgements of game entries, kept per bot session. Lives outside
// bot-runtime so live actions can flush pending acks before announcing results.

const ACK_HEADINGS: Record<string, string> = {
  rps: "[가위바위보] 참여 완료!",
  raffle: "[추첨] 응모 완료!",
  quiz: "[퀴즈] 답 접수!",
  team: "[팀 대항전] 참여 완료!",
};

const globalForAcks = globalThis as typeof globalThis & {
  naguAckBatchers?: Map<string, ReturnType<typeof createAckBatcher>>;
};
const batchers = globalForAcks.naguAckBatchers ?? new Map<string, ReturnType<typeof createAckBatcher>>();
globalForAcks.naguAckBatchers = batchers;

// "[추첨] 응모 완료! (A, B)": names go in parentheses after the heading, and
// spill into further messages instead of being truncated at 200.
export function formatAckMessages(heading: string, names: string[], maxLength = 200) {
  const messages: string[][] = [];
  for (const name of names) {
    const current = messages.at(-1);
    if (current && `${heading} (${[...current, name].join(", ")})`.length <= maxLength) current.push(name);
    else messages.push([name]);
  }
  return messages.map((group) => `${heading} (${group.join(", ")})`);
}

function getBatcher(sessionKey: string) {
  let batcher = batchers.get(sessionKey);
  if (!batcher) {
    batcher = createAckBatcher((game, nicknames) => {
      const heading = ACK_HEADINGS[game] ?? "접수 완료!";
      // Team entries arrive as "닉네임→팀" already.
      for (const message of formatAckMessages(heading, nicknames.map((nickname) => game === "team" ? nickname : truncateChatMessage(nickname, 50)))) {
        void sendBotChat(sessionKey, message);
      }
    });
    batchers.set(sessionKey, batcher);
  }
  return batcher;
}

export type AckGame = "rps" | "raffle" | "quiz" | "team";

export function queueGameAck(sessionKey: string, game: AckGame, nickname: string) {
  getBatcher(sessionKey).add(game, nickname);
}

export function flushGameAcks(sessionKey: string, game?: AckGame) {
  batchers.get(sessionKey)?.flush(game);
}

export function flushAllGameAcks() {
  for (const batcher of batchers.values()) batcher.flush();
}

export function clearGameAcks(sessionKey: string) {
  batchers.get(sessionKey)?.clear();
  batchers.delete(sessionKey);
}
