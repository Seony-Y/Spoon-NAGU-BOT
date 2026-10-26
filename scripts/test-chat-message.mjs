import assert from "node:assert/strict";

import { createCommandCooldown, getCooldownCommand } from "../src/lib/command-cooldown.ts";
import { readLimitedFormData } from "../src/lib/request-body.ts";
import {
	formatLimitedMultilineMessages,
	formatMultilineMessages,
	getCommandReply,
	resolveCommandFallback,
	truncateChatMessage,
	validateChatMessage,
} from "../src/lib/chat-message.ts";
import { parseDjCommand } from "../src/lib/dj-command.ts";
import { parseRetryAfter } from "../src/lib/spoon.ts";
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
	parseRouletteKeepCommand,
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
assert.equal(resolveCommandFallback("!없는명령어", "나구", null), null);
assert.equal(resolveCommandFallback("!!!", "나구", null), null);
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
assert.equal(formatCounterAdjustment("실드", 8), "실드 8개");

const raffleParticipants = [
	{ userId: "one", nickname: "첫 번째" },
	{ userId: "two", nickname: "두 번째" },
	{ userId: "three", nickname: "세 번째" },
];
assert.deepEqual(selectRaffleWinners(raffleParticipants, 2, () => 0), raffleParticipants.slice(0, 2));
assert.equal(new Set(selectRaffleWinners(raffleParticipants, 3, (maximum) => maximum - 1).map((entry) => entry.userId)).size, 3);
assert.deepEqual(formatRaffleResultMessages([]), ["[추첨] 응모한 분이 없어 당첨자 없이 끝났어요."]);
assert.equal(formatRaffleResultMessages(raffleParticipants)[0], "[추첨] 당첨자:\n1. 첫 번째\n2. 두 번째\n3. 세 번째");
assert.ok(formatRaffleResultMessages(Array.from({ length: 20 }, (_, index) => ({
	userId: String(index),
	nickname: `긴닉네임-${index}-${"가".repeat(40)}`,
}))).every((message) => message.length <= 200));
assert.deepEqual(parseRouletteKeepCommand("!킵 삭제 룰렛팬 / 커피 쿠폰"), {
	kind: "delete",
	nickname: "룰렛팬",
	itemLabel: "커피 쿠폰",
	count: 1,
});
assert.deepEqual(parseRouletteKeepCommand("!킵 삭제 룰렛팬 / 커피 쿠폰 / 3"), {
	kind: "delete",
	nickname: "룰렛팬",
	itemLabel: "커피 쿠폰",
	count: 3,
});
assert.deepEqual(parseRouletteKeepCommand("!킵 삭제 룰렛팬 / 커피 쿠폰 / 0"), { kind: "invalid_count" });
assert.deepEqual(parseRouletteKeepCommand("!킵 삭제 룰렛팬 / 커피 쿠폰 / -1"), { kind: "invalid_count" });
assert.deepEqual(parseRouletteKeepCommand("!킵"), { kind: "usage" });
assert.equal(parseRouletteKeepCommand("킵 삭제 룰렛팬 / 커피 쿠폰"), null);

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
	"[가위바위보] 종료! DJ는 바위를 냈어요.\n승리 청취자 보 (승)\n무승부 청취자 바위 (무)\n패배 청취자 가위 (패)",
]);

assert.equal(truncateChatMessage("가".repeat(200)), "가".repeat(200));
assert.equal(truncateChatMessage("가".repeat(201)).length, 200);
assert.equal(truncateChatMessage(`${"가".repeat(199)}😀`), "가".repeat(199));
assert.equal(truncateChatMessage(`${"가".repeat(198)}😀끝`), `${"가".repeat(198)}😀`);

assert.equal(parseRetryAfter(new Response(null, { status: 429, headers: { "Retry-After": "3600" } })), 3_600_000);
assert.equal(parseRetryAfter(new Response(null, { status: 429 })), undefined);
assert.equal(parseRetryAfter(new Response(null, { status: 503, headers: { "Retry-After": "10" } })), undefined);

assert.deepEqual(parseDjCommand("!봇"), { kind: "help" });
assert.deepEqual(parseDjCommand("!봇 상태"), { kind: "status" });
assert.deepEqual(parseDjCommand("!가위바위보 시작"), { kind: "rps_start" });
assert.deepEqual(parseDjCommand(" !가위바위보   종료 "), { kind: "rps_finish" });
assert.equal(parseDjCommand("!가위바위보 가위"), null);
assert.equal(parseDjCommand("!가위바위보"), null);
assert.deepEqual(parseDjCommand("!추첨 시작"), { kind: "raffle_start", winnerCount: 1 });
assert.deepEqual(parseDjCommand("!추첨 시작 3"), { kind: "raffle_start", winnerCount: 3 });
assert.deepEqual(parseDjCommand("!추첨 시작 5명"), { kind: "raffle_start", winnerCount: 5 });
assert.equal(parseDjCommand("!추첨 시작 0").kind, "usage");
assert.equal(parseDjCommand("!추첨 시작 abc").kind, "usage");
assert.deepEqual(parseDjCommand("!추첨 마감"), { kind: "raffle_finish" });
assert.deepEqual(parseDjCommand("!퀴즈 시작"), { kind: "quiz_start" });
assert.deepEqual(parseDjCommand("!퀴즈 끝"), { kind: "quiz_finish" });
assert.equal(parseDjCommand("!퀴즈 시작 서울"), null);
assert.deepEqual(parseDjCommand("!룰렛 켜기"), { kind: "roulette_toggle", enabled: true });
assert.deepEqual(parseDjCommand("!룰렛 OFF"), { kind: "roulette_toggle", enabled: false });
assert.deepEqual(parseDjCommand("!환영 끄기"), { kind: "automation_toggle", feature: "welcome", enabled: false });
assert.deepEqual(parseDjCommand("!공지 켜"), { kind: "automation_toggle", feature: "repeat", enabled: true });
assert.equal(parseDjCommand("!공지"), null);
assert.deepEqual(parseDjCommand("!비밀단어 시작"), { kind: "secret_start" });
assert.deepEqual(parseDjCommand("!비밀단어 힌트"), { kind: "secret_hint" });
assert.deepEqual(parseDjCommand("!비밀단어 종료"), { kind: "secret_finish" });
assert.equal(parseDjCommand("!비밀단어 고구마"), null);
assert.deepEqual(parseDjCommand("!팀전 시작"), { kind: "team_start" });
assert.deepEqual(parseDjCommand("!팀전 상태"), { kind: "team_status" });
assert.deepEqual(parseDjCommand("!팀전 마감"), { kind: "team_finish" });
assert.equal(parseDjCommand("!팀 1"), null, "listener command, not a DJ command");
assert.deepEqual(parseDjCommand("!팔로우 켜기"), { kind: "automation_toggle", feature: "follow", enabled: true });
assert.equal(parseDjCommand("!실드 +1"), null);
assert.equal(parseDjCommand("!참여"), null);
assert.equal(parseDjCommand("안녕하세요"), null);

// A long list is cut to a few messages, ending with how many were left out.
const manySongs = Array.from({ length: 100 }, (_, index) => `#${index + 1} 아주 긴 노래 제목 ${index + 1} - 가수 이름 ${index + 1}`);
const limitedSongs = formatLimitedMultilineMessages("신청곡 목록:", "신청곡 (이어서)", manySongs, 3, (count) => `…외 ${count}곡`);
assert.equal(limitedSongs.length, 3);
assert.ok(limitedSongs.every((message) => message.length <= 200));
const shownSongs = limitedSongs.join("\n").split("\n").filter((line) => line.startsWith("#")).length;
assert.ok(limitedSongs.at(-1).endsWith(`…외 ${100 - shownSongs}곡`));
assert.deepEqual(
	formatLimitedMultilineMessages("목록:", "이어서", ["#1 a", "#2 b"], 3, (count) => `외 ${count}`),
	["목록:\n#1 a\n#2 b"],
);

// Command cooldown: per listener and command word; game entries are exempt.
const cooldown = createCommandCooldown(2_000);
assert.equal(cooldown.allow("dj", "u1", "!명령어", 0), true);
assert.equal(cooldown.allow("dj", "u1", "!명령어", 1_000), false);
assert.equal(cooldown.allow("dj", "u1", " !명령어 ", 1_500), false);
assert.equal(cooldown.allow("dj", "u2", "!명령어", 1_000), true, "another listener");
assert.equal(cooldown.allow("other-dj", "u1", "!명령어", 1_000), true, "another broadcast");
assert.equal(cooldown.allow("dj", "u1", "!신청곡 목록", 1_000), true, "another command");
assert.equal(cooldown.allow("dj", "u1", "!신청곡 a-b", 1_500), false, "same command word");
assert.equal(cooldown.allow("dj", "u1", "!명령어", 2_000), true, "after the cooldown");
assert.equal(cooldown.allow("dj", "u1", "!정답 사과", 0), true);
assert.equal(cooldown.allow("dj", "u1", "!정답 배", 100), true, "quiz guesses are exempt");
assert.equal(cooldown.allow("dj", "u1", "그냥 채팅", 0), true);
assert.equal(cooldown.allow("dj", "u1", "그냥 채팅", 100), true, "plain chat is not a command");
assert.equal(getCooldownCommand("!!!"), "!!!");
assert.equal(getCooldownCommand("!"), null);

// Form bodies are capped while reading, with or without a declared length.
const smallForm = new FormData();
smallForm.set("message", "안녕");
const smallRequest = new Request("http://localhost/", { method: "POST", body: smallForm });
assert.equal((await readLimitedFormData(smallRequest, 1024)).get("message"), "안녕");
const bigForm = new FormData();
bigForm.set("message", "x".repeat(10_000));
assert.equal(await readLimitedFormData(new Request("http://localhost/", { method: "POST", body: bigForm }), 1024), "too_large");
const chunkedBody = new ReadableStream({
	start(controller) {
		for (let index = 0; index < 10; index += 1) controller.enqueue(new Uint8Array(500));
		controller.close();
	},
});
const chunkedRequest = new Request("http://localhost/", {
	method: "POST",
	body: chunkedBody,
	duplex: "half",
	headers: { "content-type": "application/x-www-form-urlencoded" },
});
assert.equal(await readLimitedFormData(chunkedRequest, 1024), "too_large");
assert.equal([...(await readLimitedFormData(new Request("http://localhost/", { method: "POST", body: "garbage", headers: { "content-type": "multipart/form-data; boundary=x" } }), 1024)).keys()].length, 0);

console.log("Chat checks passed: validation, replies, counters, song requests, DJ commands, list limits, cooldowns, and body limits");