import { type BotEvent } from "@/lib/bot-runtime";
import { type RouletteKeep } from "@/lib/session-store";

export const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

export function formatDateTime(value: string | number) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date);
}

export function formatElapsedTime(value: number | null) {
  if (value === null) return "기록 없음";
  if (value < 1000) return `${value}ms`;
  const seconds = value / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}초`;
}

export function getFirstCorrectAt(submissions: Array<{ correct: boolean; correctAt: number | null }>) {
  const correctTimes = submissions.flatMap((submission) => (
    submission.correct && submission.correctAt !== null ? [submission.correctAt] : []
  ));
  return correctTimes.length > 0 ? Math.min(...correctTimes) : null;
}

export function groupRouletteKeeps(keeps: RouletteKeep[]) {
  const users = new Map<string, {
    userId: string;
    nickname: string;
    items: Array<{ label: string; count: number }>;
  }>();
  for (const keep of keeps) {
    const user = users.get(keep.userId) ?? {
      userId: keep.userId,
      nickname: keep.nickname,
      items: [],
    };
    user.nickname = keep.nickname;
    user.items.push({ label: keep.itemLabel, count: keep.count });
    users.set(keep.userId, user);
  }
  return [...users.values()];
}

export function normalizeRoulettePercentages(
  items: Array<{ id: number; weight: number }>,
  missWeight: number,
) {
  const entries = [
    { key: "miss", weight: Math.max(0, missWeight) },
    ...items.map((item) => ({ key: String(item.id), weight: Math.max(0, item.weight) })),
  ];
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total === 0) entries[0].weight = 1;
  const divisor = total || 1;
  const shares = entries.map((entry) => {
    const exact = (entry.weight / divisor) * 10_000;
    return { ...entry, basisPoints: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const remaining = 10_000 - shares.reduce((sum, share) => sum + share.basisPoints, 0);
  const order = [...shares].sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; index < remaining; index += 1) order[index % order.length].basisPoints += 1;
  const format = (basisPoints: number) => (basisPoints / 100).toFixed(2).replace(/\.00$/u, "");
  return new Map(shares.map((share) => [share.key, format(share.basisPoints)]));
}

export function summarizeEvent(event: BotEvent) {
  const name = event.data.user.nickname ?? "익명";

  switch (event.type) {
    case "chat":
      return `${name}: ${event.data.message}`;
    case "presence":
      return `${name}님이 입장했습니다.`;
    case "like":
      return `${name}님이 하트 ${event.data.totalAmount.toLocaleString("ko-KR")}개를 보냈습니다.`;
    case "donation":
      return `${name}님이 ${event.data.amount.toLocaleString("ko-KR")}스푼을 후원했습니다.`;
    case "follow":
      return `${name}님이 DJ를 팔로우했습니다.`;
  }
}
