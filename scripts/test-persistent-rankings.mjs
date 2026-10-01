import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters";
process.env.SESSION_STORE_PATH = join(tmpdir(), `nagu-ranking-test-${process.pid}.db`);

const legacyDatabase = new DatabaseSync(process.env.SESSION_STORE_PATH);
legacyDatabase.exec(`
	CREATE TABLE song_requests (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_key TEXT NOT NULL,
		requester_nickname TEXT NOT NULL,
		title TEXT NOT NULL,
		created_at INTEGER NOT NULL
	)
`);
legacyDatabase.close();

const store = await import("../src/lib/session-store.ts");

const token = {
	access_token: "test-access",
	token_type: "Bearer",
	expires_in: 3600,
	refresh_token: "test-refresh",
	scope: "events.chat events.presence events.like events.donation",
};
const now = new Date().toISOString();
const firstSessionId = "first-session";
store.saveSession(firstSessionId, token);
const firstSessionKey = store.getSessionKey(firstSessionId);
store.linkDjWorkspaceByKey(firstSessionKey, "dj-user-id", "DJ 나구");

const settings = store.getBotSettings(firstSessionId);
const commandReplies = store.getAvailableCommandRepliesByKey(firstSessionKey, settings.commandsEnabled);
assert.match(commandReplies.join(" "), /전체 사용 명령어:/);
assert.match(commandReplies.join(" "), /DJ 전용 명령어:.*!실드 \+N\/-N.*!신청곡 삭제 번호/);
store.updateBotSettings(firstSessionId, {
	...settings,
	greetingMessage: "저장된 {nickname}님 환영 문구",
	repeatMessage: "저장된 반복 문구",
});
store.upsertBotCommand(firstSessionId, "!테스트", "영구 명령어");
store.upsertBotCommand(firstSessionId, "!수정전", "이전 응답");
assert.equal(store.updateBotCommand(firstSessionId, "!수정전", "!수정후", "수정된 응답"), true);
assert.equal(store.findBotCommandResponse(firstSessionKey, "!수정전", null), null);
assert.equal(store.findBotCommandResponse(firstSessionKey, "!수정후", null), "수정된 응답");
assert.equal(store.updateBotCommand(firstSessionId, "!수정후", "!테스트", "충돌 응답"), false);
assert.equal(store.findBotCommandResponse(firstSessionKey, "!수정후", null), "수정된 응답");
const populatedCommandReplies = store.getAvailableCommandRepliesByKey(firstSessionKey, true).join(" ");
assert.match(populatedCommandReplies, /!테스트/);
assert.match(populatedCommandReplies, /DJ 전용 명령어:/);
assert.doesNotMatch(populatedCommandReplies, /영구 명령어|수정된 응답|실드 0개/);
const shield = store.listBotCounters(firstSessionId).find((counter) => counter.name === "실드");
assert.equal(store.saveBotCounter(firstSessionId, shield.id, shield.name, 5), true);
assert.equal(store.applyBotCounterCommand(firstSessionKey, "!실드 +2", true), "실드 7개 남았습니다.");
assert.equal(store.listBotCounters(firstSessionId).find((counter) => counter.id === shield.id).value, 7);
assert.deepEqual(
	store.applySongRequestCommand(firstSessionKey, "!신청곡 목록", false, "청취자 A"),
	["신청곡 목록이 비어 있습니다."],
);
store.applySongRequestCommand(firstSessionKey, "!신청곡 밤편지-아이유", false, "청취자 A");
assert.match(
	store.applySongRequestCommand(firstSessionKey, "!신청곡 목록", false, "청취자 A").join(" "),
	/#\d+ 밤편지 - 아이유/,
);

const donation = {
	id: "event-donation-1",
	event: "donation",
	data: { user: { id: "listener-a", nickname: "청취자 A" }, amount: 300, message: null, time: now },
};
const like = {
	id: "event-like-1",
	event: "like",
	data: {
		user: { id: "listener-a", nickname: "청취자 A" },
		type: "FREE",
		totalAmount: 25,
		amount: 25,
		extraAmount: 0,
		combo: null,
		time: now,
	},
};
const presence = {
	id: "event-presence-1",
	event: "presence",
	data: {
		user: { id: "listener-a", nickname: "청취자 A" },
		type: "JOIN",
		fanRank: 1,
		isManager: false,
		favoriteTemperature: 38.5,
		time: now,
	},
};

assert.equal(store.recordAudienceEvent(firstSessionKey, 101, donation), true);
assert.equal(store.recordAudienceEvent(firstSessionKey, 101, donation), false);
assert.equal(store.recordAudienceEvent(firstSessionKey, 101, like), true);
assert.equal(store.recordAudienceEvent(firstSessionKey, 101, presence), true);

const heartReplies = store.getAudienceRankingCommandRepliesByKey(
	firstSessionKey, 101, "!하트랭킹", "listener-a", "청취자 A",
);
assert.match(heartReplies[0], /1위 청취자 A 25개/);
const spoonReplies = store.getAudienceRankingCommandRepliesByKey(
	firstSessionKey, 101, "!스푼랭킹", "listener-a", "청취자 A",
);
assert.match(spoonReplies[0], /1위 청취자 A/);
assert.doesNotMatch(spoonReplies.join(" "), /300/);
const myInfoReplies = store.getAudienceRankingCommandRepliesByKey(
	firstSessionKey, 101, "!내정보", "listener-a", "청취자 A",
);
assert.match(myInfoReplies[0], /하트 1위 \(25개\)/);
assert.match(myInfoReplies[0], /애청온도 1위 \(38\.5°C\)/);
assert.match(myInfoReplies[0], /스푼 1위/);
assert.doesNotMatch(myInfoReplies.join(" "), /300/);

store.deleteSession(firstSessionId);
const secondSessionId = "second-session";
store.saveSession(secondSessionId, token);
const secondSessionKey = store.getSessionKey(secondSessionId);
store.linkDjWorkspaceByKey(secondSessionKey, "dj-user-id", "DJ 나구");

assert.equal(store.getBotSettings(secondSessionId).greetingMessage, "저장된 {nickname}님 환영 문구");
assert.equal(store.getBotSettings(secondSessionId).repeatMessage, "저장된 반복 문구");
assert.equal(store.findBotCommandResponse(secondSessionKey, "!테스트", null), "영구 명령어");
const restoredSongRequests = store.listSongRequests(secondSessionId);
assert.equal(restoredSongRequests.length, 1);
assert.equal(restoredSongRequests[0].title, "밤편지");
assert.equal(restoredSongRequests[0].artist, "아이유");

for (const period of ["current", "daily", "all"]) {
	const ranking = store.listAudienceRankings(secondSessionId, period, 101);
	assert.equal(ranking.length, 1);
	assert.equal(ranking[0].userId, "listener-a");
	assert.equal(ranking[0].spoons, 300);
	assert.equal(ranking[0].hearts, 25);
	assert.equal(ranking[0].favoriteTemperature, 38.5);
}

for (let index = 1; index <= 11; index += 1) {
	store.recordAudienceEvent(secondSessionKey, 202, {
		id: `event-ranking-limit-${index}`,
		event: "like",
		data: {
			user: { id: `listener-limit-${index}`, nickname: `랭커 ${index}` },
			type: "FREE",
			totalAmount: 100 - index,
			amount: 100 - index,
			extraAmount: 0,
			combo: null,
			time: now,
		},
	});
}
const limitedHeartReplies = store.getAudienceRankingCommandRepliesByKey(
	secondSessionKey, 202, "!하트랭킹", "listener-limit-1", "랭커 1",
).join(" ");
assert.equal((limitedHeartReplies.match(/\d+위 /g) ?? []).length, 10);
assert.doesNotMatch(limitedHeartReplies, /11위/);

console.log("Persistent ranking checks passed: restore, deduplication, and period totals");