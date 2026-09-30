import type { ParsedSseEvent } from "./spoon-events";

const HEART_MILESTONE = 100;

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
};

const defaultOptions: BotAutomationOptions = {
  djNickname: "DJ",
  greetingMessage: "안녕하세요. DJ {name}입니다. {nickname}님, 반가워요!",
  donationMessage: "{nickname}님, {amount}스푼 후원 감사합니다!",
  heartMessage: "하트 {milestone}개를 달성했어요! 감사합니다!",
  welcomeEnabled: true,
  donationEnabled: true,
  heartEnabled: true,
};

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

export function processBotAutomation(
  state: BotAutomationState,
  event: ParsedSseEvent,
  options: BotAutomationOptions = defaultOptions,
) {
  if (event.event === "presence") {
    if (state.greetedUserIds.has(event.data.user.id)) return null;
    state.greetedUserIds.add(event.data.user.id);
    state.activity.welcomedListeners += 1;
    if (!options.welcomeEnabled) return null;
    const name = event.data.user.nickname ?? "청취자";
    const prefix = event.data.fanRank === 1
      ? "1위 팬"
      : event.data.isManager
        ? "매니저"
        : event.data.favoriteTemperature !== null && event.data.favoriteTemperature >= 36.5
          ? "단골"
          : "";
    const greeting = options.greetingMessage
      .replaceAll("{name}", options.djNickname || "DJ")
      .replaceAll("{nickname}", name);
    return `${prefix ? `${prefix} ` : ""}${greeting}`;
  }

  if (event.event === "donation") {
    state.activity.spoons += event.data.amount;
    if (!options.donationEnabled) return null;
    const name = event.data.user.nickname ?? "청취자";
    return options.donationMessage
      .replaceAll("{name}", options.djNickname || "DJ")
      .replaceAll("{nickname}", name)
      .replaceAll("{amount}", event.data.amount.toLocaleString("ko-KR"));
  }

  if (event.event === "like") {
    state.activity.hearts += event.data.totalAmount;
    if (!options.heartEnabled) return null;
    const milestone = Math.floor(state.activity.hearts / HEART_MILESTONE) * HEART_MILESTONE;
    if (milestone > state.announcedHeartMilestone) {
      state.announcedHeartMilestone = milestone;
      return options.heartMessage
        .replaceAll("{name}", options.djNickname || "DJ")
        .replaceAll("{milestone}", milestone.toLocaleString("ko-KR"));
    }
  }

  return null;
}