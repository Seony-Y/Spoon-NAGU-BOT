import type { ParsedSseEvent } from "./spoon-events";

export type BotActivity = {
  hearts: number;
  spoons: number;
  welcomedListeners: number;
};

export type BotAutomationState = {
  activity: BotActivity;
  greetedUserIds: Set<string>;
  announcedHeartMilestone: number;
};

export type BotAutomationOptions = {
  djNickname: string;
  greetingMessage: string;
  donationMessage: string;
  heartMessage: string;
  welcomeEnabled: boolean;
  donationEnabled: boolean;
  heartEnabled: boolean;
  followMessage: string;
  followEnabled: boolean;
};

const defaultOptions: BotAutomationOptions = {
  djNickname: "",
  greetingMessage: "안녕하세요. DJ {name}입니다. {nickname}님, 반가워요!",
  donationMessage: "{nickname}님, {amount}스푼 후원 감사합니다!",
  heartMessage: "{nickname}님, 하트 {milestone}개 감사합니다!",
  welcomeEnabled: true,
  donationEnabled: true,
  heartEnabled: true,
  followMessage: "{nickname}님, 팔로우 감사합니다!",
  followEnabled: true,
};

export function normalizeDjNickname(value: string) {
  const trimmed = value.trim();
  const wrapped = trimmed.match(/^\{([^{}]+)\}$/);
  return wrapped ? wrapped[1].trim() : trimmed;
}

// Fills {name} with the DJ's display name. Until it is known, "DJ {name}" in
// a template collapses to "DJ" so messages never read "DJ DJ입니다".
export function fillDjName(template: string, djNickname: string) {
  const name = normalizeDjNickname(djNickname);
  return name
    ? template.replaceAll("{name}", name)
    : template.replaceAll("DJ {name}", "DJ").replaceAll("{name}", "DJ");
}

export function createBotAutomationState(): BotAutomationState {
  return {
    activity: { hearts: 0, spoons: 0, welcomedListeners: 0 },
    greetedUserIds: new Set(),
    announcedHeartMilestone: 0,
  };
}

export function resetBotAutomationState(state: BotAutomationState) {
  state.activity = { hearts: 0, spoons: 0, welcomedListeners: 0 };
  state.greetedUserIds.clear();
  state.announcedHeartMilestone = 0;
}

export function diffListenerSnapshot<T extends { id: string }>(
  previousIds: Set<string> | null,
  listeners: T[],
) {
  const currentIds = new Set(listeners.map((listener) => listener.id));
  return {
    currentIds,
    joinedListeners: previousIds
      ? listeners.filter((listener) => !previousIds.has(listener.id))
      : [],
  };
}

export function processBotAutomation(
  state: BotAutomationState,
  event: ParsedSseEvent,
  options: BotAutomationOptions = defaultOptions,
) {
  if (event.event === "presence") {
    if (!options.welcomeEnabled) return null;
    if (state.greetedUserIds.has(event.data.user.id)) return null;
    state.greetedUserIds.add(event.data.user.id);
    state.activity.welcomedListeners += 1;
    const name = event.data.user.nickname ?? "청취자";
    const prefix = event.data.fanRank === 1
      ? "1위 팬"
      : event.data.isManager
        ? "매니저"
        : event.data.subscribed
          ? "구독자"
          : event.data.favoriteTemperature !== null && event.data.favoriteTemperature >= 36.5
            ? "단골"
            : "";
    // The title belongs to the listener ("단골 철수님"), not to the whole greeting.
    const greeting = fillDjName(options.greetingMessage, options.djNickname);
    if (!prefix) return greeting.replaceAll("{nickname}", name);
    return greeting.includes("{nickname}")
      ? greeting.replace("{nickname}", `${prefix} ${name}`).replaceAll("{nickname}", name)
      : `${prefix} ${greeting}`;
  }

  if (event.event === "donation") {
    state.activity.spoons += event.data.amount;
    if (!options.donationEnabled) return null;
    const name = event.data.user.nickname ?? "청취자";
    return fillDjName(options.donationMessage, options.djNickname)
      .replaceAll("{nickname}", name)
      .replaceAll("{amount}", event.data.amount.toLocaleString("ko-KR"));
  }

  if (event.event === "like") {
    state.activity.hearts += event.data.totalAmount;
    if (!options.heartEnabled) return null;
    state.announcedHeartMilestone = event.data.totalAmount;
    return formatHeartMessage(options, event.data.user.nickname, event.data.totalAmount);
  }

  // Spoon delivers only a listener's first follow per broadcast, so no dedupe here.
  if (event.event === "follow") {
    if (!options.followEnabled) return null;
    return fillDjName(options.followMessage, options.djNickname)
      .replaceAll("{nickname}", event.data.user.nickname ?? "청취자");
  }

  return null;
}

export function formatHeartMessage(
  options: Pick<BotAutomationOptions, "djNickname" | "heartMessage">,
  nickname: string | null,
  amount: number,
) {
  return fillDjName(options.heartMessage, options.djNickname)
    .replaceAll("{nickname}", nickname ?? "청취자")
    .replaceAll("{milestone}", amount.toLocaleString("ko-KR"));
}

// Collects successful game entries per game for a few seconds and reports them
// together, so fifty "!참여" messages get one bot reply instead of fifty.
export function createAckBatcher(
  onFlush: (game: string, nicknames: string[]) => void,
  { quietMs = 3_000, maxWaitMs = 8_000 } = {},
) {
  const pending = new Map<string, { nicknames: Set<string>; firstAt: number; timer: ReturnType<typeof setTimeout> }>();

  const flush = (game: string) => {
    const entry = pending.get(game);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(game);
    onFlush(game, [...entry.nicknames]);
  };

  return {
    add(game: string, nickname: string, now = Date.now()) {
      const current = pending.get(game);
      if (current) clearTimeout(current.timer);
      const firstAt = current?.firstAt ?? now;
      const timer = setTimeout(() => flush(game), Math.max(0, Math.min(quietMs, firstAt + maxWaitMs - now)));
      timer.unref?.();
      const nicknames = current?.nicknames ?? new Set<string>();
      nicknames.add(nickname);
      pending.set(game, { nicknames, firstAt, timer });
    },
    flush(game?: string) {
      for (const key of game ? [game] : [...pending.keys()]) flush(key);
    },
    clear() {
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    },
  };
}

export type HeartBatch = { userId: string; nickname: string | null; amount: number };

// Merges consecutive heart events from the same listener into one thank-you.
// Different listeners are never merged, so each person is still thanked by name.
// A listener who keeps tapping is flushed after maxWaitMs so the thanks is not
// postponed indefinitely.
export function createHeartBatcher(
  onFlush: (batch: HeartBatch) => void,
  { quietMs = 3_000, maxWaitMs = 10_000 } = {},
) {
  const pending = new Map<string, HeartBatch & { firstAt: number; timer: ReturnType<typeof setTimeout> }>();

  const flush = (userId: string) => {
    const entry = pending.get(userId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(userId);
    onFlush({ userId: entry.userId, nickname: entry.nickname, amount: entry.amount });
  };

  const schedule = (userId: string, delay: number) => {
    const timer = setTimeout(() => flush(userId), delay);
    timer.unref?.();
    return timer;
  };

  return {
    // Sends every pending thank-you now (used at shutdown).
    flush() {
      for (const userId of [...pending.keys()]) flush(userId);
    },
    add(userId: string, nickname: string | null, amount: number, now = Date.now()) {
      const current = pending.get(userId);
      if (current) clearTimeout(current.timer);
      const firstAt = current?.firstAt ?? now;
      const delay = Math.max(0, Math.min(quietMs, firstAt + maxWaitMs - now));
      pending.set(userId, {
        userId,
        nickname: nickname ?? current?.nickname ?? null,
        amount: (current?.amount ?? 0) + amount,
        firstAt,
        timer: schedule(userId, delay),
      });
    },
    clear() {
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
    },
  };
}