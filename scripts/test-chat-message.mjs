import assert from "node:assert/strict";

import { getCommandReply, validateChatMessage } from "../src/lib/chat-message.ts";

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

console.log("Chat checks passed: validation boundaries and automatic command replies");