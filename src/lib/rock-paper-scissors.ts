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
}>) {
  if (entries.length === 0) return ["이번 라운드에는 참가자가 없습니다."];
  const messages: string[] = [];
  for (const entry of entries) {
    const result = entry.result === "win" ? "승" : entry.result === "draw" ? "무" : "패";
    const label = `${entry.nickname} ${entry.choice}(${result})`;
    const prefix = messages.length === 0 ? "가위바위보 결과: " : "결과 계속: ";
    const current = messages.at(-1);
    if (!current || `${current}, ${label}`.length > 200) {
      messages.push(`${prefix}${label}`);
    } else {
      messages[messages.length - 1] = `${current}, ${label}`;
    }
  }
  return messages;
}