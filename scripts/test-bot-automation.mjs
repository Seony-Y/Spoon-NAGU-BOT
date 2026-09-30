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

assert.equal(processBotAutomation(state, presence), "1위 팬 일등팬님, 어서 오세요!");
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

console.log("Automation checks passed: greetings, hearts, donations, and reset");