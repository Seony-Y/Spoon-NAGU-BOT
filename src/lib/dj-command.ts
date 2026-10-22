export type AutomationFeature = "welcome" | "donation" | "heart" | "repeat" | "follow";

export type DjCommand =
  | { kind: "help" }
  | { kind: "status" }
  | { kind: "rps_start" }
  | { kind: "rps_finish" }
  | { kind: "raffle_start"; winnerCount: number }
  | { kind: "raffle_finish" }
  | { kind: "quiz_start" }
  | { kind: "quiz_finish" }
  | { kind: "roulette_toggle"; enabled: boolean }
  | { kind: "automation_toggle"; feature: AutomationFeature; enabled: boolean }
  | { kind: "usage"; usage: string };

export const MAX_RAFFLE_WINNERS = 100_000;

const AUTOMATION_NAMES: Record<string, AutomationFeature> = {
  환영: "welcome",
  후원: "donation",
  하트: "heart",
  공지: "repeat",
  팔로우: "follow",
};

export const AUTOMATION_LABELS: Record<AutomationFeature, string> = {
  welcome: "입장 환영",
  donation: "후원 감사",
  heart: "하트 감사",
  repeat: "반복 공지",
  follow: "팔로우 감사",
};

const START_WORDS = new Set(["시작"]);
const FINISH_WORDS = new Set(["종료", "마감", "끝"]);
const ON_WORDS = new Set(["켜기", "켜", "on"]);
const OFF_WORDS = new Set(["끄기", "꺼", "off"]);

function parseToggle(word: string | undefined) {
  const normalized = word?.toLowerCase();
  if (normalized && ON_WORDS.has(normalized)) return true;
  if (normalized && OFF_WORDS.has(normalized)) return false;
  return null;
}

export const DJ_COMMAND_HELP = [
  "!가위바위보 시작 / 종료",
  "!추첨 시작 [인원] / 종료",
  "!퀴즈 시작 / 종료 (대시보드에 등록한 문제 순서대로)",
  "!룰렛 켜기 / 끄기",
  "!환영 · !후원 · !하트 · !팔로우 · !공지 켜기 / 끄기",
  "!봇 상태",
];

// Parses DJ-only control commands. Returns null for anything that is not a DJ
// control command so the message can fall through to listener commands.
export function parseDjCommand(message: string): DjCommand | null {
  const parts = message.trim().split(/\s+/u);
  const [head, action, argument, ...rest] = parts;
  if (!head?.startsWith("!")) return null;
  const name = head.slice(1);

  if (name === "봇") {
    if (!action || action === "도움말") return { kind: "help" };
    if (action === "상태" && !argument) return { kind: "status" };
    return null;
  }

  if (name === "가위바위보") {
    if (argument !== undefined || !action) return null;
    if (START_WORDS.has(action)) return { kind: "rps_start" };
    if (FINISH_WORDS.has(action)) return { kind: "rps_finish" };
    return null;
  }

  if (name === "추첨") {
    if (!action || rest.length > 0) return null;
    if (START_WORDS.has(action)) {
      if (argument === undefined) return { kind: "raffle_start", winnerCount: 1 };
      const winnerCount = /^\d{1,6}$/u.test(argument.replace(/명$/u, ""))
        ? Number(argument.replace(/명$/u, ""))
        : Number.NaN;
      return Number.isSafeInteger(winnerCount) && winnerCount >= 1 && winnerCount <= MAX_RAFFLE_WINNERS
        ? { kind: "raffle_start", winnerCount }
        : { kind: "usage", usage: "사용법: !추첨 시작 (당첨 인원) 예: !추첨 시작 3" };
    }
    if (FINISH_WORDS.has(action) && argument === undefined) return { kind: "raffle_finish" };
    return null;
  }

  if (name === "퀴즈") {
    if (argument !== undefined || !action) return null;
    if (START_WORDS.has(action)) return { kind: "quiz_start" };
    if (FINISH_WORDS.has(action)) return { kind: "quiz_finish" };
    return null;
  }

  if (name === "룰렛") {
    if (argument !== undefined) return null;
    const enabled = parseToggle(action);
    return enabled === null ? null : { kind: "roulette_toggle", enabled };
  }

  const feature = AUTOMATION_NAMES[name];
  if (feature && argument === undefined) {
    const enabled = parseToggle(action);
    return enabled === null ? null : { kind: "automation_toggle", feature, enabled };
  }

  return null;
}
