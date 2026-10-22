import assert from "node:assert/strict";

import {
  createAckBatcher,
  createBotAutomationState,
  createHeartBatcher,
  diffListenerSnapshot,
  formatHeartMessage,
  normalizeDjNickname,
  processBotAutomation,
  resetBotAutomationState,
} from "../src/lib/bot-automation.ts";

const state = createBotAutomationState();
const initialListeners = diffListenerSnapshot(null, [
  { id: "fan-1", nickname: "기존 청취자" },
]);
assert.deepEqual(initialListeners.joinedListeners, []);
const nextListeners = diffListenerSnapshot(initialListeners.currentIds, [
  { id: "fan-1", nickname: "기존 청취자" },
  { id: "fan-2", nickname: "신규 청취자" },
]);
assert.deepEqual(nextListeners.joinedListeners, [{ id: "fan-2", nickname: "신규 청취자" }]);
assert.equal(normalizeDjNickname("나구"), "나구");
assert.equal(normalizeDjNickname(" {나구} "), "나구");
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
  "안녕하세요. DJ입니다. 1위 팬 일등팬님, 반가워요!",
);
assert.equal(processBotAutomation(state, presence), null);
assert.equal(state.activity.welcomedListeners, 1);

const like = (totalAmount, user = { id: "fan-1", nickname: "일등팬" }) => ({
  event: "like",
  data: {
    user,
    type: "FREE",
    totalAmount,
    amount: totalAmount,
    extraAmount: 0,
    combo: null,
    time: "2026-09-30T00:00:00Z",
  },
});

assert.equal(
  processBotAutomation(state, like(1, { id: "fan-1", nickname: "1번 사용자" })),
  "1번 사용자님, 하트 1개 감사합니다!",
);
assert.equal(
  processBotAutomation(state, like(2, { id: "fan-2", nickname: "2번 사용자" })),
  "2번 사용자님, 하트 2개 감사합니다!",
);
assert.equal(processBotAutomation(state, like(250)), "일등팬님, 하트 250개 감사합니다!");
assert.equal(state.activity.hearts, 253);

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
  djNickname: "{나구}",
  greetingMessage: "DJ {name}의 방송입니다. {nickname}님, 잘 오셨어요!",
  welcomeEnabled: true,
  donationEnabled: false,
  heartEnabled: false,
};
assert.equal(
  processBotAutomation(configuredState, presence, configuredOptions),
  "DJ 나구의 방송입니다. 1위 팬 일등팬님, 잘 오셨어요!",
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

const toggledWelcomeState = createBotAutomationState();
assert.equal(processBotAutomation(toggledWelcomeState, presence, {
  ...configuredOptions,
  welcomeEnabled: false,
}), null);
assert.equal(toggledWelcomeState.greetedUserIds.size, 0);
assert.equal(toggledWelcomeState.activity.welcomedListeners, 0);
assert.equal(
  processBotAutomation(toggledWelcomeState, presence, configuredOptions),
  "DJ 나구의 방송입니다. 1위 팬 일등팬님, 잘 오셨어요!",
);

const templateState = createBotAutomationState();
const templateOptions = {
  djNickname: "나구",
  greetingMessage: "{nickname}님 환영합니다!",
  donationMessage: "{nickname}님이 {amount}스푼을 보내셨어요!",
  heartMessage: "누적 하트 {milestone}개 달성!",
  welcomeEnabled: true,
  donationEnabled: true,
  heartEnabled: true,
};
assert.equal(processBotAutomation(templateState, {
  event: "donation",
  data: {
    user: { id: "fan-3", nickname: "후원왕" },
    amount: 1200,
    message: null,
    time: "2026-09-30T00:00:00Z",
  },
}, templateOptions), "후원왕님이 1,200스푼을 보내셨어요!");
assert.equal(
  processBotAutomation(templateState, like(100), templateOptions),
  "누적 하트 100개 달성!",
);

const flushed = [];
const batcher = createHeartBatcher((batch) => flushed.push(batch), { quietMs: 30, maxWaitMs: 80 });
batcher.add("fan-1", "일등팬", 1);
batcher.add("fan-1", "일등팬", 2);
batcher.add("fan-2", "이등팬", 5);
await new Promise((resolve) => setTimeout(resolve, 60));
assert.deepEqual(flushed.sort((a, b) => a.userId.localeCompare(b.userId)), [
  { userId: "fan-1", nickname: "일등팬", amount: 3 },
  { userId: "fan-2", nickname: "이등팬", amount: 5 },
]);

flushed.length = 0;
const tapping = setInterval(() => batcher.add("fan-3", "연타팬", 1), 10);
await new Promise((resolve) => setTimeout(resolve, 120));
clearInterval(tapping);
assert.ok(flushed.length >= 1, "continuous tapping still flushes after maxWaitMs");
batcher.clear();

assert.equal(
  formatHeartMessage({ djNickname: "{나구}", heartMessage: "{name}: {nickname}님 하트 {milestone}개" }, null, 1200),
  "나구: 청취자님 하트 1,200개",
);

const follow = { event: "follow", data: { user: { id: "fan-9", nickname: "새팔로워" }, time: "2026-10-20T00:00:00Z" } };
assert.equal(processBotAutomation(createBotAutomationState(), follow), "새팔로워님, 팔로우 감사합니다!");
assert.equal(
  processBotAutomation(createBotAutomationState(), follow, {
    djNickname: "나구", greetingMessage: "", donationMessage: "", heartMessage: "",
    welcomeEnabled: true, donationEnabled: true, heartEnabled: true,
    followMessage: "DJ {name}을 팔로우해 준 {nickname}님 고마워요!", followEnabled: true,
  }),
  "DJ 나구을 팔로우해 준 새팔로워님 고마워요!",
);
assert.equal(
  processBotAutomation(createBotAutomationState(), follow, {
    djNickname: "", greetingMessage: "", donationMessage: "", heartMessage: "",
    welcomeEnabled: true, donationEnabled: true, heartEnabled: true,
    followMessage: "x", followEnabled: false,
  }),
  null,
);

const acks = [];
const ackBatcher = createAckBatcher((game, nicknames) => acks.push([game, nicknames]), { quietMs: 20, maxWaitMs: 60 });
ackBatcher.add("raffle", "가");
ackBatcher.add("raffle", "나");
ackBatcher.add("raffle", "가");
ackBatcher.add("quiz", "다");
ackBatcher.flush("quiz");
assert.deepEqual(acks, [["quiz", ["다"]]]);
await new Promise((resolve) => setTimeout(resolve, 40));
assert.deepEqual(acks, [["quiz", ["다"]], ["raffle", ["가", "나"]]]);
ackBatcher.clear();

const subscriberJoin = {
  event: "presence",
  data: { user: { id: "sub-1", nickname: "구독팬" }, type: "JOIN", fanRank: null, isManager: false, favoriteTemperature: 40, time: "2026-10-22T00:00:00Z", subscribed: true },
};
assert.equal(processBotAutomation(createBotAutomationState(), subscriberJoin), "안녕하세요. DJ입니다. 구독자 구독팬님, 반가워요!");

const shutdownFlushed = [];
const shutdownBatcher = createHeartBatcher((batch) => shutdownFlushed.push(batch), { quietMs: 10_000, maxWaitMs: 20_000 });
shutdownBatcher.add("fan-7", "마지막팬", 4);
shutdownBatcher.flush();
assert.deepEqual(shutdownFlushed, [{ userId: "fan-7", nickname: "마지막팬", amount: 4 }]);

console.log("Automation checks passed: settings, greetings, subscribers, hearts, heart batching, ack batching, donations, follows, and reset");