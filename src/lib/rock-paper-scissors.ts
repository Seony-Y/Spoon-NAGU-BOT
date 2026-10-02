import { formatMultilineMessages } from "./chat-message";

export const RPS_CHOICES = ["가위", "바위", "보"] as const;

export type RpsChoice = typeof RPS_CHOICES[number];
export type RpsResult = "win" | "draw" | "lose";

export function isRpsChoice(value: string): value is RpsChoice {
  return RPS_CHOICES.includes(value as RpsChoice);
}

export function parseRpsCommand(message: string) {
  const match = /^!가위바위보(?:\s+(가위|바위|보))?$/u.exec(message.trim());
  if (!match) return null;
  return match[1] && isRpsChoice(match[1]) ? match[1] : "usage";
}

export function getRpsResult(listenerChoice: RpsChoice, djChoice: RpsChoice): RpsResult {
  if (listenerChoice === djChoice) return "draw";
  if (
    (listenerChoice === "가위" && djChoice === "보")
    || (listenerChoice === "바위" && djChoice === "가위")
    || (listenerChoice === "보" && djChoice === "바위")
  ) {
    return "win";
  }
  return "lose";
}

export function formatRpsResultMessages(entries: Array<{
  nickname: string;
  choice: RpsChoice;
  result: RpsResult;
}>, djChoice: RpsChoice) {
  if (entries.length === 0) return [`DJ 선택: ${djChoice} / 이번 라운드에는 참가자가 없습니다.`];
  const labels = entries.map((entry) => {
    const result = entry.result === "win" ? "승" : entry.result === "draw" ? "무" : "패";
    return `${entry.nickname.slice(0, 50)} ${entry.choice} (${result})`;
  });
  return formatMultilineMessages(
    `[가위바위보] DJ 선택: ${djChoice}`,
    "[가위바위보] 결과 계속:",
    labels,
  );
}