import assert from "node:assert/strict";

import {
	formatMultilineMessages,
	getCommandReply,
	resolveCommandFallback,
	validateChatMessage,
} from "../src/lib/chat-message.ts";
import {
	formatCounterAdjustment,
	parseCounterCommand,
	parseCounterAdjustment,
	parseCounterQuery,
} from "../src/lib/counter-command.ts";
import { parseSongRequestCommand } from "../src/lib/song-request-command.ts";
import {
	formatRpsResultMessages,
	getRpsResult,
	parseRpsCommand,
} from "../src/lib/rock-paper-scissors.ts";
import {
	formatRaffleResultMessages,
	selectRaffleWinners,
} from "../src/lib/raffle.ts";

assert.equal(validateChatMessage("   "), "invalid_message");
assert.equal(validateChatMessage("가".repeat(200)), null);
assert.equal(validateChatMessage("가".repeat(201)), "message_too_long");
assert.equal(validateChatMessage("😀".repeat(100)), null);
assert.equal(validateChatMessage("😀".repeat(101)), "message_too_long");
assert.deepEqual(formatMultilineMessages("결과:", "결과 계속:", ["첫째", "둘째"]), ["결과:\n첫째\n둘째"]);
assert.deepEqual(
	formatMultilineMessages("결과:", "결과 계속:", ["가".repeat(196), "둘째"]),
	[`${"결과:\n"}${"가".repeat(196)}`, "결과 계속:\n둘째"],
);

assert.equal(getCommandReply(" !안녕 ", "나구"), "나구님, 반가워요!");
assert.equal(getCommandReply("!안녕", null), "청취자님, 반가워요!");
assert.equal(getCommandReply("!명령어", "누구든"), "사용 가능한 명령어: !안녕, !명령어");
assert.equal(getCommandReply("안녕하세요", "나구"), null);
assert.equal(getCommandReply("!안녕", "긴".repeat(200)), "반가워요!");
assert.equal(resolveCommandFallback("!안녕", "나구", null), "나구님, 반가워요!");
assert.equal(resolveCommandFallback("!공지", "나구", "저장된 공지"), "저장된 공지");
assert.equal(
	resolveCommandFallback("!없는명령어", "나구", null),
	"등록되지 않은 명령어입니다. !명령어로 사용 가능한 명령어를 확인해 주세요.",
);
assert.equal(resolveCommandFallback("일반 채팅", "나구", null), null);

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

const raffleParticipants = [
	{ userId: "one", nickname: "첫 번째" },
	{ userId: "two", nickname: "두 번째" },
	{ userId: "three", nickname: "세 번째" },
];
assert.deepEqual(selectRaffleWinners(raffleParticipants, 2, () => 0), raffleParticipants.slice(0, 2));
assert.equal(new Set(selectRaffleWinners(raffleParticipants, 3, (maximum) => maximum - 1).map((entry) => entry.userId)).size, 3);
assert.deepEqual(formatRaffleResultMessages([]), ["[추첨] 참가자가 없어 당첨자 없이 종료했습니다."]);
assert.equal(formatRaffleResultMessages(raffleParticipants)[0], "[추첨] 당첨자:\n1. 첫 번째\n2. 두 번째\n3. 세 번째");
assert.ok(formatRaffleResultMessages(Array.from({ length: 20 }, (_, index) => ({
	userId: String(index),
	nickname: `긴닉네임-${index}-${"가".repeat(40)}`,
}))).every((message) => message.length <= 200));

assert.deepEqual(parseSongRequestCommand("!신청곡 밤편지-아이유"), {
	kind: "add",
	title: "밤편지",
	artist: "아이유",
});
assert.deepEqual(parseSongRequestCommand("!신청곡 밤편지 - 아이유"), {
	kind: "add",
	title: "밤편지",
	artist: "아이유",
});
assert.deepEqual(parseSongRequestCommand("!신청곡 밤편지"), { kind: "usage" });
assert.deepEqual(parseSongRequestCommand("!신청곡 -아이유"), { kind: "usage" });
assert.deepEqual(parseSongRequestCommand("!신청곡 밤편지-"), { kind: "usage" });
assert.deepEqual(parseSongRequestCommand(" !신청곡 목록 "), { kind: "list" });
assert.deepEqual(parseSongRequestCommand(" !신청곡 삭제 42 "), { kind: "delete", id: 42 });
assert.deepEqual(parseSongRequestCommand("!신청곡"), { kind: "usage" });
assert.deepEqual(parseSongRequestCommand(`!신청곡 ${"가".repeat(101)}`), { kind: "usage" });
assert.equal(parseSongRequestCommand("신청곡 밤편지"), null);

assert.equal(parseRpsCommand("!가위바위보 보"), "보");
assert.equal(parseRpsCommand("!가위바위보"), "usage");
assert.equal(parseRpsCommand("가위바위보 가위"), null);
assert.equal(getRpsResult("보", "바위"), "win");
assert.equal(getRpsResult("가위", "가위"), "draw");
assert.equal(getRpsResult("가위", "바위"), "lose");
assert.deepEqual(formatRpsResultMessages([
	{ nickname: "승리 청취자", choice: "보", result: "win" },
	{ nickname: "무승부 청취자", choice: "바위", result: "draw" },
	{ nickname: "패배 청취자", choice: "가위", result: "lose" },
], "바위"), [
	"[가위바위보] DJ 선택: 바위\n승리 청취자 보 (승)\n무승부 청취자 바위 (무)\n패배 청취자 가위 (패)",
]);

console.log("Chat checks passed: validation, replies, counters, and song requests");