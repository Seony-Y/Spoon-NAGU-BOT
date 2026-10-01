import assert from "node:assert/strict";

import { getCommandReply, validateChatMessage } from "../src/lib/chat-message.ts";
import {
	formatCounterAdjustment,
	parseCounterCommand,
	parseCounterAdjustment,
	parseCounterQuery,
} from "../src/lib/counter-command.ts";

assert.equal(validateChatMessage("   "), "invalid_message");
assert.equal(validateChatMessage("가".repeat(200)), null);
assert.equal(validateChatMessage("가".repeat(201)), "message_too_long");
assert.equal(validateChatMessage("😀".repeat(100)), null);
assert.equal(validateChatMessage("😀".repeat(101)), "message_too_long");

assert.equal(getCommandReply(" !안녕 ", "나구"), "나구님, 반가워요!");
assert.equal(getCommandReply("!안녕", null), "청취자님, 반가워요!");
assert.equal(getCommandReply("!명령어", "누구든"), "사용 가능한 명령어: !안녕, !명령어");
assert.equal(getCommandReply("안녕하세요", "나구"), null);
assert.equal(getCommandReply("!안녕", "긴".repeat(200)), "반가워요!");

assert.deepEqual(parseCounterAdjustment(" !실드 -2 "), { name: "실드", delta: -2 });
assert.deepEqual(parseCounterAdjustment("!펀딩 +1000"), { name: "펀딩", delta: 1000 });
assert.equal(parseCounterAdjustment("!실드 2"), null);
assert.equal(parseCounterAdjustment("!실드 +0"), null);
assert.equal(parseCounterAdjustment("!실드 +1000001"), null);
assert.equal(parseCounterQuery(" !실드 "), "실드");
assert.equal(parseCounterQuery("!실드 +1"), null);
assert.deepEqual(parseCounterCommand("!실드", false), { kind: "query", name: "실드" });
assert.deepEqual(parseCounterCommand("!실드 +2", true), {
	kind: "adjust",
	adjustment: { name: "실드", delta: 2 },
});
assert.deepEqual(parseCounterCommand("!실드 -1", false), {
	kind: "denied",
	adjustment: { name: "실드", delta: -1 },
});
assert.equal(formatCounterAdjustment("실드", 8), "실드 8개 남았습니다.");

console.log("Chat checks passed: validation, replies, and counter adjustments");