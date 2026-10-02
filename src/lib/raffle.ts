import { randomInt } from "node:crypto";
import { formatMultilineMessages } from "./chat-message";

export type RaffleParticipant = {
  userId: string;
  nickname: string;
};

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