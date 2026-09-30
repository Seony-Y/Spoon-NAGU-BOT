import assert from "node:assert/strict";

import {
  createBotAutomationState,
  processBotAutomation,
  resetBotAutomationState,
} from "../src/lib/bot-automation.ts";

const state = createBotAutomationState();
const presence = {
  event: "presence",
  data: {
    user: { id: "fan-1", nickname: "일등팬" },
    type: "JOIN",
    fanRank: 1,
    isManager: false,
    favoriteTemperature: 40,
    time: "2026-09-30T00:00:00Z",
  },
};

assert.equal(
  processBotAutomation(state, presence),
  "1위 팬 안녕하세요. DJ DJ입니다. 일등팬님, 반가워요!",
);
assert.equal(processBotAutomation(state, presence), null);
assert.equal(state.activity.welcomedListeners, 1);

const like = (totalAmount) => ({
  event: "like",
  data: {
    user: { id: "fan-1", nickname: "일등팬" },
    type: "FREE",
    totalAmount,
    amount: totalAmount,
    extraAmount: 0,
    combo: null,
    time: "2026-09-30T00:00:00Z",
  },
});

assert.equal(processBotAutomation(state, like(99)), null);
assert.equal(processBotAutomation(state, like(1)), "하트 100개를 달성했어요! 감사합니다!");
assert.equal(processBotAutomation(state, like(250)), "하트 300개를 달성했어요! 감사합니다!");
assert.equal(state.activity.hearts, 350);

assert.equal(processBotAutomation(state, {
  event: "donation",
  data: {
    user: { id: "fan-2", nickname: "후원자" },
    amount: 300,
    message: null,
    time: "2026-09-30T00:00:00Z",
  },
}), "후원자님, 300스푼 후원 감사합니다!");
assert.equal(state.activity.spoons, 300);

resetBotAutomationState(state);
assert.deepEqual(state.activity, { hearts: 0, spoons: 0, welcomedListeners: 0 });
assert.equal(state.greetedUserIds.size, 0);
assert.equal(state.announcedHeartMilestone, 0);

const configuredState = createBotAutomationState();
const configuredOptions = {
  djNickname: "나구",
  greetingMessage: "DJ {name}의 방송입니다. {nickname}님, 잘 오셨어요!",
  welcomeEnabled: true,
  donationEnabled: false,
  heartEnabled: false,
};
assert.equal(
  processBotAutomation(configuredState, presence, configuredOptions),
  "1위 팬 DJ 나구의 방송입니다. 일등팬님, 잘 오셨어요!",
);
assert.equal(processBotAutomation(configuredState, like(100), configuredOptions), null);
assert.equal(processBotAutomation(configuredState, {
  event: "donation",
  data: {
    user: { id: "fan-2", nickname: "후원자" },
    amount: 100,
    message: null,
    time: "2026-09-30T00:00:00Z",
  },
}, configuredOptions), null);
assert.equal(configuredState.activity.hearts, 100);
assert.equal(configuredState.activity.spoons, 100);

console.log("Automation checks passed: settings, greetings, hearts, donations, and reset");