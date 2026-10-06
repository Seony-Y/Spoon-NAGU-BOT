import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
const backups = await import("../src/lib/workspace-backup.ts");

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
const migratedSessionColumns = migratedDatabase.prepare("PRAGMA table_info(oauth_sessions)").all();
assert.ok(migratedSessionColumns.some((column) => column.name === "current_live_id"));
assert.ok(migratedSessionColumns.some((column) => column.name === "auth_valid"));
const migratedRpsColumns = migratedDatabase.prepare("PRAGMA table_info(rps_rounds)").all();
assert.equal(migratedRpsColumns.find((column) => column.name === "workspace_key").pk, 1);
assert.equal(migratedRpsColumns.find((column) => column.name === "round_id").pk, 2);
migratedDatabase.close();
const firstSessionKey = store.getSessionKey(firstSessionId);
store.linkDjWorkspaceByKey(firstSessionKey, "dj-user-id", "DJ 나구");

store.updateRouletteSettings(firstSessionId, { enabled: true, cost: 1, missWeight: 0 });
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
assert.deepEqual(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-empty", 1), () => 0), {
	nickname: "룰렛팬",
	itemLabel: null,
	isMiss: true,
	keepCount: null,
});
store.updateRouletteSettings(firstSessionId, { enabled: true, cost: 1, missWeight: 1 });
assert.equal(store.saveRouletteItem(firstSessionId, null, "커피 쿠폰", 1), true);
assert.equal(store.saveRouletteItem(firstSessionId, null, "노래 신청권", 3), true);
assert.equal(store.saveRouletteItem(firstSessionId, null, "커피 쿠폰", 5), false);
const rouletteItems = store.listRouletteItems(firstSessionId);
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-under", 0), () => 0), null);
assert.deepEqual(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-1", 1), () => 0), {
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
const rouletteKeepReplies = store.getRouletteKeepCommandRepliesByKey(firstSessionKey, "!내 킵", "roulette-user", "룰렛팬");
assert.deepEqual(rouletteKeepReplies, ["룰렛팬님의 킵:\n노래 신청권 1개\n커피 쿠폰 2개"]);
assert.ok(rouletteKeepReplies.every((reply) => reply.length <= 200));
assert.deepEqual(
	store.getRouletteKeepCommandRepliesByKey(firstSessionKey, "!내 킵", "different-user", "룰렛팬"),
	["룰렛팬님의 킵 목록이 비어 있습니다."],
);
assert.equal(
	store.getRouletteKeepCommandRepliesByKey(firstSessionKey, "!룰렛팬 킵", "roulette-user", "룰렛팬"),
	null,
);
assert.equal(store.updateRouletteKeeps(firstSessionId, [
	{ userId: "roulette-user", itemLabel: "커피 쿠폰", count: 5 },
	{ userId: "roulette-user", itemLabel: "노래 신청권", count: 3 },
]), true);
assert.deepEqual(
	store.listRouletteKeeps(firstSessionId).map((keep) => [keep.itemLabel, keep.count]),
	[["노래 신청권", 3], ["커피 쿠폰", 5]],
);
assert.equal(store.updateRouletteKeeps(firstSessionId, [
	{ userId: "roulette-user", itemLabel: "커피 쿠폰", count: 0 },
]), false);
assert.equal(
	store.applyRouletteKeepCommand(firstSessionKey, "!킵 삭제 룰렛팬 / 커피 쿠폰", false),
	"킵 삭제는 DJ만 할 수 있습니다.",
);
assert.equal(
	store.applyRouletteKeepCommand(firstSessionKey, "!킵 삭제 룰렛팬 / 커피 쿠폰 / 0", true),
	"차감 수량은 1개 이상 입력해야합니다.",
);
assert.equal(
	store.applyRouletteKeepCommand(firstSessionKey, "!킵 삭제 룰렛팬 / 없는 경품", true),
	"존재하는 킵이 아닙니다.",
);
assert.equal(
	store.applyRouletteKeepCommand(firstSessionKey, "!킵 삭제 룰렛팬 / 커피 쿠폰", true),
	"룰렛팬님의 커피 쿠폰 킵 1개를 삭제했습니다. (4개 남음)",
);
assert.equal(
	store.applyRouletteKeepCommand(firstSessionKey, "!킵 삭제 룰렛팬 / 커피 쿠폰 / 3", true),
	"룰렛팬님의 커피 쿠폰 킵 3개를 삭제했습니다. (1개 남음)",
);
assert.equal(store.deleteRouletteKeeps(firstSessionId, [
	{ userId: "roulette-user", itemLabel: "커피 쿠폰" },
	{ userId: "roulette-user", itemLabel: "노래 신청권" },
]), true);
assert.deepEqual(store.listRouletteKeeps(firstSessionId), []);
assert.deepEqual(
	store.getRouletteKeepCommandRepliesByKey(firstSessionKey, "!내 킵", "roulette-user", "룰렛팬"),
	["룰렛팬님의 킵 목록이 비어 있습니다."],
);
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-restore-coffee-1"), () => 0).itemLabel, "커피 쿠폰");
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-restore-coffee-2"), () => 0).itemLabel, "커피 쿠폰");
assert.equal(store.applyRouletteDonation(firstSessionKey, 101, rouletteEvent("roulette-restore-song"), () => 0.4).itemLabel, "노래 신청권");
assert.equal(store.listRouletteResults(firstSessionId).length, 8);
assert.equal(store.listRouletteResults(firstSessionId).some((result) => result.isMiss), true);
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

assert.equal(store.startRaffleRound(firstSessionId, 300), true);
assert.equal(store.startRaffleRound(firstSessionId, 1), false);
assert.match(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-1", "추첨 참가자 1"), /참여 완료/);
assert.equal(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-1", "추첨 참가자 1"), "이미 참여했습니다.");
assert.match(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-2", "추첨 참가자 2"), /참여 완료/);
assert.match(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-3", "추첨 참가자 3"), /참여 완료/);
const finishedRaffle = store.finishRaffleRound(firstSessionId, () => 0);
assert.equal(finishedRaffle.active, false);
assert.equal(finishedRaffle.entries.filter((entry) => entry.winner).length, 3);
assert.deepEqual(finishedRaffle.entries.filter((entry) => entry.winner).map((entry) => entry.userId), ["raffle-1", "raffle-2", "raffle-3"]);
assert.equal(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-4", "늦은 참가자"), "현재 진행 중인 추첨이 없습니다.");
assert.equal(store.listRaffleRounds(firstSessionId)[0].roundId, 1);

assert.equal(store.startQuizRound(firstSessionId, "", "정답"), false);
assert.equal(store.startQuizRound(firstSessionId, "대한민국의 수도는?", "서울", 10_000), true);
assert.equal(store.startQuizRound(firstSessionId, "다음 문제", "다음 정답"), false);
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 부산", false, "quiz-1", "퀴즈 참가자 1", 11_000), "퀴즈 참가자 1님, 답안을 제출했습니다.");
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 부산", false, "quiz-1", "퀴즈 참가자 1", 12_000), "이미 동일한 대답을 제출했습니다.");
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 인천", false, "quiz-2", "퀴즈 참가자 2", 11_500), "퀴즈 참가자 2님, 답안을 제출했습니다.");
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 대구", false, "quiz-1", "퀴즈 참가자 1", 11_500), "퀴즈 참가자 1님, 답안을 제출했습니다.");
assert.deepEqual(store.getQuizRoundByKey(firstSessionKey).submissions.map((entry) => entry.userId), ["quiz-2", "quiz-1"]);
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 서울", false, "quiz-2", "퀴즈 참가자 2", 13_500), "퀴즈 참가자 2님, 답안을 제출했습니다.");
assert.equal(store.getQuizRoundByKey(firstSessionKey).active, true);
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 서울", false, "quiz-1", "퀴즈 참가자 1", 13_500), "퀴즈 참가자 1님, 답안을 제출했습니다.");
const finishedQuiz = store.finishQuizRound(firstSessionId, 15_000);
assert.equal(finishedQuiz.active, false);
assert.equal(finishedQuiz.winnerUserId, "quiz-2");
assert.equal(finishedQuiz.winnerNickname, "퀴즈 참가자 2");
assert.equal(finishedQuiz.elapsedMs, 3_500);
assert.deepEqual(finishedQuiz.submissions.filter((entry) => entry.correct).map((entry) => entry.userId), ["quiz-2", "quiz-1"]);
assert.deepEqual(store.formatQuizResultMessages(finishedQuiz), [
	"퀴즈 종료! 정답: 서울\n최초 정답: 퀴즈 참가자 2 (3.5초)\n최초 정답: 퀴즈 참가자 1 (3.5초)\n정답자: 퀴즈 참가자 2 (3.5초)\n정답자: 퀴즈 참가자 1 (3.5초)",
]);
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 서울", false, "quiz-3", "늦은 참가자"), "현재 진행 중인 퀴즈가 없습니다.");

const settings = store.getBotSettings(firstSessionId);
const commandReplies = store.getAvailableCommandRepliesByKey(firstSessionKey);
assert.match(commandReplies.join(" "), /전체 사용 명령어:/);
assert.match(commandReplies.join(" "), /DJ 전용 명령어:\n!실드 \+N\/-N\n!신청곡 삭제 번호/);
assert.doesNotMatch(commandReplies.join(" "), /!하트랭킹/);
assert.doesNotMatch(commandReplies.join(" "), /!오늘의 하트랭킹/);
assert.doesNotMatch(commandReplies.join(" "), /!애청온도랭킹/);
assert.doesNotMatch(commandReplies.join(" "), /!오늘의 애청온도랭킹/);
assert.doesNotMatch(commandReplies.join(" "), /스푼랭킹|!내정보/);
assert.match(commandReplies.join(" "), /!참여/);
assert.match(commandReplies.join(" "), /!킵 삭제 닉네임 \/ 항목명 \/ 수량/);
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
assert.equal(store.getLatestAudienceLiveIdByKey(firstSessionKey), 101);
store.setCurrentLiveIdByKey(firstSessionKey, 101);
assert.equal(store.getCurrentLiveIdByKey(firstSessionKey), 101);
assert.deepEqual(store.getLiveAutomationStateByKey(firstSessionKey, 101), {
	activity: { hearts: 25, spoons: 300, welcomedListeners: 1 },
	greetedUserIds: ["listener-a"],
});
store.syncLiveFanSpoonRanking(firstSessionKey, 101, [
	{ id: "listener-a", nickname: "청취자 A", rank: 2, spoonCount: 300 },
	{ id: "listener-before-bot", nickname: "기존 후원자", rank: 1, spoonCount: 500 },
]);
store.recordRecentBotEventByKey(firstSessionKey, presence, "2026-09-30T00:00:00.000Z");
assert.equal(store.listRecentBotEventsByKey(firstSessionKey)[0].type, "presence");

assert.equal(store.listAudienceRankings(firstSessionId, "all").find(
	(entry) => entry.userId === "listener-a",
).spoons, 300);

const coreBackup = backups.createSignedWorkspaceBackup(firstSessionId, false);
assert.equal(coreBackup.includesAudience, false);
assert.equal(coreBackup.data.tables.audience_events, undefined);
assert.equal(coreBackup.data.tables.raffle_rounds.length, 1);
assert.equal(coreBackup.data.tables.raffle_entries.length, 3);
assert.equal(coreBackup.data.tables.quiz_rounds.length, 1);
assert.equal(coreBackup.data.tables.quiz_submissions.length, 2);
assert.equal(JSON.stringify(coreBackup).includes("test-access"), false);
assert.ok(backups.parseSignedWorkspaceBackup(JSON.parse(JSON.stringify(coreBackup))));
const preQuizBackup = structuredClone(coreBackup);
delete preQuizBackup.data.tables.quiz_rounds;
delete preQuizBackup.data.tables.quiz_submissions;
const { signature: ignoredSignature, ...preQuizBody } = preQuizBackup;
void ignoredSignature;
preQuizBackup.signature = createHmac("sha256", process.env.SESSION_SECRET)
	.update("nagu-workspace-backup-v1\0")
	.update(JSON.stringify(preQuizBody))
	.digest("hex");
assert.ok(backups.parseSignedWorkspaceBackup(preQuizBackup));
const tamperedBackup = JSON.parse(JSON.stringify(coreBackup));
tamperedBackup.data.tables.bot_settings[0].dj_nickname = "변조된 DJ";
assert.equal(backups.parseSignedWorkspaceBackup(tamperedBackup), null);
store.updateBotSettings(firstSessionId, {
	...store.getBotSettings(firstSessionId),
	djNickname: "임시 DJ",
});
assert.equal(backups.restoreSignedWorkspaceBackup(firstSessionId, coreBackup), true);
assert.equal(store.getBotSettings(firstSessionId).djNickname, "DJ 나구");
const fullBackup = backups.createSignedWorkspaceBackup(firstSessionId, true);
assert.equal(fullBackup.includesAudience, true);
assert.equal(fullBackup.data.tables.audience_events.length, 3);

store.setBotEnabled(firstSessionId, true);
store.invalidateStoredAuthSession(firstSessionId);
assert.equal(store.getSession(firstSessionId), null);
assert.equal(store.isBotEnabled(firstSessionId), true);
store.saveSession(firstSessionId, { ...token, access_token: "reauthenticated-access" });
assert.equal(store.getSession(firstSessionId).access_token, "reauthenticated-access");
assert.equal(store.isBotEnabled(firstSessionId), true);
assert.equal(store.getCurrentLiveIdByKey(firstSessionKey), 101);
assert.equal(store.getBotSettings(firstSessionId).djNickname, "DJ 나구");

store.deleteSession(firstSessionId);
const secondSessionId = "second-session";
store.saveSession(secondSessionId, token);
const secondSessionKey = store.getSessionKey(secondSessionId);
assert.equal(store.startRpsRound(secondSessionId, "가위"), true);
store.applyRpsCommand(secondSessionKey, "!가위바위보 바위", false, "listener-reconnect", "재접속 참가자");
assert.equal(store.startRaffleRound(secondSessionId, 1), true);
store.applyRaffleCommand(secondSessionKey, "!참여", false, "raffle-reconnect", "재접속 추첨 참가자");
assert.equal(store.startQuizRound(secondSessionId, "병합할 문제", "병합 정답", 20_000), true);
store.applyQuizCommand(secondSessionKey, "!정답 오답", false, "quiz-reconnect", "재접속 퀴즈 참가자", 21_000);
store.linkDjWorkspaceByKey(secondSessionKey, "dj-user-id", "DJ 나구");

assert.equal(store.listRecentBotEventsByKey(secondSessionKey)[0].type, "presence");
store.clearRecentBotEventsByKey(secondSessionKey);
assert.deepEqual(store.listRecentBotEventsByKey(secondSessionKey), []);
assert.deepEqual(
	store.listRouletteKeeps(secondSessionId).map((keep) => [keep.nickname, keep.itemLabel, keep.count]),
	[["룰렛팬", "노래 신청권", 2], ["룰렛팬", "커피 쿠폰", 2]],
);
assert.match(
	store.getRouletteKeepCommandRepliesByKey(secondSessionKey, "!내 킵", "roulette-user", "룰렛팬").join(" "),
	/커피 쿠폰 2개/,
);
const restoredActiveRpsRound = store.getRpsRound(secondSessionId);
assert.equal(restoredActiveRpsRound.active, true);
assert.equal(restoredActiveRpsRound.roundId, 2);
assert.equal(restoredActiveRpsRound.entries[0].nickname, "재접속 참가자");
const restoredRaffleRounds = store.listRaffleRounds(secondSessionId);
assert.deepEqual(restoredRaffleRounds.map((round) => [round.roundId, round.active]), [[2, true], [1, false]]);
assert.equal(restoredRaffleRounds[0].entries[0].nickname, "재접속 추첨 참가자");
assert.equal(store.finishRaffleRound(secondSessionId, () => 0).roundId, 2);
assert.deepEqual(
	store.listRpsRounds(secondSessionId).map((round) => [round.roundId, round.active]),
	[[2, true], [1, false]],
);
assert.equal(store.finishRpsRound(secondSessionId).roundId, 2);
const mergedQuizRounds = store.listQuizRounds(secondSessionId);
assert.deepEqual(mergedQuizRounds.map((round) => [round.roundId, round.active]), [[2, true], [1, false]]);
assert.equal(mergedQuizRounds[0].submissions[0].nickname, "재접속 퀴즈 참가자");
assert.equal(store.finishQuizRound(secondSessionId, 22_000).roundId, 2);
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
	assert.equal(ranking.length, 2);
	const restoredListener = ranking.find((entry) => entry.userId === "listener-a");
	assert.equal(restoredListener.spoons, 300);
	assert.equal(restoredListener.hearts, 25);
	assert.equal(restoredListener.favoriteTemperature, 38.5);
	assert.equal(ranking.find((entry) => entry.userId === "listener-before-bot").spoons, 500);
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
	store.recordAudienceEvent(secondSessionKey, 202, {
		id: `event-favorite-ranking-limit-${index}`,
		event: "presence",
		data: {
			user: { id: `listener-limit-${index}`, nickname: `랭커 ${index}` },
			type: "JOIN",
			fanRank: null,
			isManager: false,
			favoriteTemperature: 50 - (index / 10),
			time: now,
		},
	});
}

const longRouletteLabels = Array.from(
	{ length: 5 },
	(_, index) => `긴 경품 ${index + 1} ${"가".repeat(35)}`,
);
assert.equal(store.updateRouletteDistribution(
	secondSessionId,
	0,
	longRouletteLabels.map((label) => ({ label, percentage: 2000 })),
), true);
longRouletteLabels.forEach((label, index) => {
	assert.equal(
		store.applyRouletteDonation(
			secondSessionKey,
			303,
			rouletteEvent(`roulette-long-${index}`),
			() => (index + 0.5) / longRouletteLabels.length,
		)?.itemLabel,
		label,
	);
});
const longKeepReplies = store.getRouletteKeepCommandRepliesByKey(
	secondSessionKey,
	"!내 킵",
	"roulette-user",
	"룰렛팬",
);
assert.ok(longKeepReplies.length > 1);
assert.ok(longKeepReplies.every((reply) => reply.length <= 200));
assert.ok(longKeepReplies.every((reply) => reply.includes("\n")));

console.log("Persistent ranking checks passed: restore, deduplication, and period totals");