import { randomInt } from "node:crypto";
import { formatMultilineMessages } from "./chat-message";

export type RaffleParticipant = {
  userId: string;
  nickname: string;
};

export type RouletteKeepCommand =
  | { kind: "delete"; nickname: string; itemLabel: string; count: number }
  | { kind: "invalid_count" }
  | { kind: "usage" };

export function parseRouletteKeepCommand(message: string): RouletteKeepCommand | null {
  const match = /^!킵(?:\s+(.+))?$/u.exec(message.trim());
  if (!match) return null;

  const deleteMatch = /^삭제\s+(.+)$/u.exec(match[1]?.trim() ?? "");
  if (!deleteMatch) return { kind: "usage" };
  const parts = deleteMatch[1].split("/").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3 || !parts[0] || !parts[1]) return { kind: "usage" };

  const count = parts.length === 2 ? 1 : Number(parts[2]);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1_000_000) {
    return { kind: "invalid_count" };
  }
  if (parts[0].length > 50 || parts[1].length > 50) {
    return { kind: "usage" };
  }
  return { kind: "delete", nickname: parts[0], itemLabel: parts[1], count };
}

export function selectRaffleWinners(
  participants: RaffleParticipant[],
  winnerCount: number,
  pickIndex: (maximum: number) => number = randomInt,
) {
  const shuffled = [...participants];
  const count = Math.min(Math.max(0, winnerCount), shuffled.length);
  for (let index = 0; index < count; index += 1) {
    const selectedIndex = index + pickIndex(shuffled.length - index);
    [shuffled[index], shuffled[selectedIndex]] = [shuffled[selectedIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

export function formatRaffleResultMessages(winners: RaffleParticipant[]) {
  if (winners.length === 0) return ["[추첨] 참가자가 없어 당첨자 없이 종료했습니다."];
  const labels = winners.map((winner, index) => `${index + 1}. ${winner.nickname.slice(0, 50)}`);
  return formatMultilineMessages("[추첨] 당첨자:", "[추첨] 당첨자 계속:", labels);
}