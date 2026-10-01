import { randomInt } from "node:crypto";

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
  const replies: string[] = [];
  for (const label of labels) {
    const prefix = replies.length === 0 ? "[추첨] 당첨자: " : "[추첨] 당첨자 계속: ";
    const current = replies.at(-1);
    if (!current || `${current}, ${label}`.length > 200) {
      replies.push(`${prefix}${label}`);
    } else {
      replies[replies.length - 1] = `${current}, ${label}`;
    }
  }
  return replies;
}