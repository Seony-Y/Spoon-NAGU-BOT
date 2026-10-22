import "server-only";

import { createAckBatcher } from "./bot-automation";
import { sendBotChat } from "./chat";
import { formatMultilineMessages } from "./chat-message";

// Batched acknowledgements of game entries, kept per bot session. Lives outside
// bot-runtime so live actions can flush pending acks before announcing results.

const ACK_HEADINGS: Record<string, string> = {
  rps: "[가위바위보] 참여 완료! 결과는 끝나고 알려 드려요.",
  raffle: "[추첨] 응모 완료!",
  quiz: "[퀴즈] 답 접수!",
  team: "[팀 대항전] 팀 참여 완료!",
};

const globalForAcks = globalThis as typeof globalThis & {
  naguAckBatchers?: Map<string, ReturnType<typeof createAckBatcher>>;
};
const batchers = globalForAcks.naguAckBatchers ?? new Map<string, ReturnType<typeof createAckBatcher>>();
globalForAcks.naguAckBatchers = batchers;

// Joins names with commas into lines short enough that formatMultilineMessages
// can spread them over several messages instead of truncating at 200.
function joinIntoLines(names: string[], maxLength = 120) {
  const lines: string[] = [];
  for (const name of names) {
    const last = lines.at(-1);
    if (last !== undefined && `${last}, ${name}`.length <= maxLength) lines[lines.length - 1] = `${last}, ${name}`;
    else lines.push(name);
  }
  return lines;
}

function getBatcher(sessionKey: string) {
  let batcher = batchers.get(sessionKey);
  if (!batcher) {
    batcher = createAckBatcher((game, nicknames) => {
      const heading = ACK_HEADINGS[game] ?? "접수 완료!";
      for (const message of formatMultilineMessages(
        heading,
        `${heading.split(" ")[0]} (이어서)`,
        joinIntoLines(nicknames.map((nickname) => `${nickname.slice(0, 50)}님`)),
      )) void sendBotChat(sessionKey, message);
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
