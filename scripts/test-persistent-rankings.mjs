import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters";
process.env.SESSION_STORE_PATH = join(tmpdir(), `nagu-ranking-test-${process.pid}.db`);
rmSync(process.env.SESSION_STORE_PATH, { force: true });

const legacyDatabase = new DatabaseSync(process.env.SESSION_STORE_PATH);
legacyDatabase.exec(`
	CREATE TABLE song_requests (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		session_key TEXT NOT NULL,
		requester_nickname TEXT NOT NULL,
		title TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);
	CREATE TABLE rps_rounds (
		workspace_key TEXT PRIMARY KEY,
		round_id INTEGER NOT NULL,
		dj_choice TEXT NOT NULL,
		active INTEGER NOT NULL DEFAULT 1,
		started_at INTEGER NOT NULL,
		ended_at INTEGER
	);
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
const migratedDatabase = new DatabaseSync(process.env.SESSION_STORE_PATH);
const migratedRpsColumns = migratedDatabase.prepare("PRAGMA table_info(rps_rounds)").all();
assert.equal(migratedRpsColumns.find((column) => column.name === "workspace_key").pk, 1);
assert.equal(migratedRpsColumns.find((column) => column.name === "round_id").pk, 2);
migratedDatabase.close();
const firstSessionKey = store.getSessionKey(firstSessionId);
store.linkDjWorkspaceByKey(firstSessionKey, "dj-user-id", "DJ 나구");

store.updateRouletteSettings(firstSessionId, { enabled: true, cost: 20, missWeight: 1 });
assert.equal(store.saveRouletteItem(firstSessionId, null, "커피 쿠폰", 1), true);
assert.equal(store.saveRouletteItem(firstSessionId, null, "노래 신청권", 3), true);
assert.equal(store.saveRouletteItem(firstSessionId, null, "커피 쿠폰", 5), false);
const rouletteItems = store.listRouletteItems(firstSessionId);
const rouletteEvent = (id, amount = 20) => ({
	id,
	event: "donation",
	data: {
		user: { id: "roulette-user", nickname: "룰렛팬" },
		amount,
		message: null,
		time: now,
	},
});
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-under", 19), () => 0), null);
assert.deepEqual(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-1"), () => 0), {
	nickname: "룰렛팬",
	itemLabel: "커피 쿠폰",
	isMiss: false,
	keepCount: 1,
});
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-1"), () => 0), null);
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-2"), () => 0).keepCount, 2);
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-3"), () => 0.79).itemLabel, "노래 신청권");
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-4"), () => 0.99).isMiss, true);
assert.deepEqual(
	store.listRouletteKeeps(firstSessionId).map((keep) => [keep.itemLabel, keep.count]),
	[["노래 신청권", 1], ["커피 쿠폰", 2]],
);
assert.match(store.getRouletteKeepCommandRepliesByKey(firstSessionKey, "!룰렛팬 킵").join(" "), /커피 쿠폰 2개/);
assert.equal(store.listRouletteResults(firstSessionId).length, 4);
assert.equal(store.listRouletteResults(firstSessionId)[0].isMiss, true);
assert.equal(store.saveRouletteItem(firstSessionId, rouletteItems[1].id, "노래 신청권 플러스", 4), true);
assert.equal(store.deleteRouletteItem(firstSessionId, rouletteItems[0].id), true);
assert.equal(store.updateRouletteDistribution(firstSessionId, 2500, [
	{ label: "커피 쿠폰", percentage: 2500 },
	{ label: "노래 신청권", percentage: 5000 },
]), true);
assert.deepEqual(
	store.listRouletteItems(firstSessionId).map((item) => [item.label, item.weight]),
	[["커피 쿠폰", 2500], ["노래 신청권", 5000]],
);
assert.equal(store.updateRouletteDistribution(firstSessionId, 2499, [
	{ label: "바뀌면 안 됨", percentage: 7500 },
]), false);
assert.equal(store.updateRouletteDistribution(firstSessionId, 5000, [
	{ label: "중복 경품", percentage: 2500 },
	{ label: "중복 경품", percentage: 2500 },
]), false);
assert.deepEqual(
	store.listRouletteItems(firstSessionId).map((item) => item.label),
	["커피 쿠폰", "노래 신청권"],
);
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-percent-win"), () => 0.7499).itemLabel, "노래 신청권");
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-percent-miss"), () => 0.75).isMiss, true);
const deletedDistributionItem = store.listRouletteItems(firstSessionId).find((item) => item.label === "커피 쿠폰");
assert.equal(store.deleteRouletteDistributionItem(firstSessionId, deletedDistributionItem.id), true);
assert.equal(store.getRouletteSettings(firstSessionId).missWeight, 5000);
assert.deepEqual(
	store.listRouletteItems(firstSessionId).map((item) => [item.label, item.weight]),
	[["노래 신청권", 5000]],
);

assert.equal(store.startRpsRound(firstSessionId, "바위"), true);
assert.equal(store.startRpsRound(firstSessionId, "가위"), false);
assert.match(
	store.applyRpsCommand(firstSessionKey, "!가위바위보 보", false, "listener-game", "게임 참가자"),
	/참여 완료/,
);
assert.match(
	store.applyRpsCommand(firstSessionKey, "!가위바위보 가위", false, "listener-game", "게임 참가자"),
	/^이미 참여하셨습니다\.$/,
);
const activeRpsRound = store.getRpsRound(firstSessionId);
assert.equal(activeRpsRound.active, true);
assert.equal(activeRpsRound.djChoice, "바위");
assert.equal(activeRpsRound.entries[0].result, "win");
const finishedRpsRound = store.finishRpsRound(firstSessionId);
assert.equal(finishedRpsRound.active, false);
assert.equal(typeof finishedRpsRound.endedAt, "number");
assert.equal(store.finishRpsRound(firstSessionId), null);
assert.deepEqual(store.listRpsRounds(firstSessionId).map((round) => round.roundId), [1]);

const settings = store.getBotSettings(firstSessionId);
const commandReplies = store.getAvailableCommandRepliesByKey(firstSessionKey);
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
store.updateBotSettings(firstSessionId, {
	...store.getBotSettings(firstSessionId),
	commandsEnabled: false,
});
assert.match(store.getAvailableCommandRepliesByKey(firstSessionKey).join(" "), /!테스트/);
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
assert.equal(store.startRpsRound(secondSessionId, "가위"), true);
store.applyRpsCommand(secondSessionKey, "!가위바위보 바위", false, "listener-reconnect", "재접속 참가자");
store.linkDjWorkspaceByKey(secondSessionKey, "dj-user-id", "DJ 나구");

const restoredActiveRpsRound = store.getRpsRound(secondSessionId);
assert.equal(restoredActiveRpsRound.active, true);
assert.equal(restoredActiveRpsRound.roundId, 2);
assert.equal(restoredActiveRpsRound.entries[0].nickname, "재접속 참가자");
assert.deepEqual(
	store.listRpsRounds(secondSessionId).map((round) => [round.roundId, round.active]),
	[[2, true], [1, false]],
);
assert.equal(store.finishRpsRound(secondSessionId).roundId, 2);
assert.equal(store.startRpsRound(secondSessionId, "보"), true);
store.applyRpsCommand(secondSessionKey, "!가위바위보 가위", false, "listener-third", "세 번째 참가자");
assert.equal(store.finishRpsRound(secondSessionId).roundId, 3);
const rpsHistory = store.listRpsRounds(secondSessionId);
assert.deepEqual(rpsHistory.map((round) => round.roundId), [3, 2, 1]);
assert.equal(rpsHistory[0].entries[0].nickname, "세 번째 참가자");
assert.equal(rpsHistory.every((round) => !round.active && typeof round.endedAt === "number"), true);

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