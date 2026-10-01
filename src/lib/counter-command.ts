const COUNTER_COMMAND_PATTERN = /^!([^\s!]{1,20})\s+([+-]\d{1,7})$/u;
const COUNTER_QUERY_PATTERN = /^!([^\s!]{1,20})$/u;
const MAX_ADJUSTMENT = 1_000_000;

export type CounterAdjustment = {
  name: string;
  delta: number;
};

export type CounterCommand =
  | { kind: "query"; name: string }
  | { kind: "adjust" | "denied"; adjustment: CounterAdjustment };

export function parseCounterAdjustment(message: string): CounterAdjustment | null {
  const match = COUNTER_COMMAND_PATTERN.exec(message.trim());
  if (!match) return null;

  const delta = Number(match[2]);
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > MAX_ADJUSTMENT) {
    return null;
  }

  return { name: match[1], delta };
}

export function formatCounterAdjustment(name: string, value: number) {
  return `${name} ${value.toLocaleString("ko-KR")}개 남았습니다.`;
}

export function parseCounterQuery(message: string) {
  return COUNTER_QUERY_PATTERN.exec(message.trim())?.[1] ?? null;
}

export function parseCounterCommand(message: string, isDj: boolean): CounterCommand | null {
  const adjustment = parseCounterAdjustment(message);
  if (adjustment) return { kind: isDj ? "adjust" : "denied", adjustment };

  const name = parseCounterQuery(message);
  return name ? { kind: "query", name } : null;
}