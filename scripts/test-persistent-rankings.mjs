import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

process.env.SESSION_SECRET = "test-session-secret-that-is-at-least-32-characters";
// Own directory: the maintenance test writes backups/ next to the database.
const testDirectory = join(tmpdir(), `nagu-ranking-test-${process.pid}`);
rmSync(testDirectory, { recursive: true, force: true });
mkdirSync(testDirectory, { recursive: true });
process.env.SESSION_STORE_PATH = join(testDirectory, "nagu.db");

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
	["룰렛팬님은 아직 킵이 없어요."],
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
	"킵 삭제는 DJ만 할 수 있어요.",
);
assert.equal(
	store.applyRouletteKeepCommand(firstSessionKey, "!킵 삭제 룰렛팬 / 커피 쿠폰 / 0", true),
	"삭제할 수량은 1개 이상이어야 해요.",
);
assert.equal(
	store.applyRouletteKeepCommand(firstSessionKey, "!킵 삭제 룰렛팬 / 없는 경품", true),
	"해당 킵을 찾지 못했어요. 닉네임과 경품 이름을 확인해 주세요.",
);
assert.equal(
	store.applyRouletteKeepCommand(firstSessionKey, "!킵 삭제 룰렛팬 / 커피 쿠폰", true),
	"룰렛팬님의 커피 쿠폰 킵 1개를 삭제했어요. (4개 남음)",
);
assert.equal(
	store.applyRouletteKeepCommand(firstSessionKey, "!킵 삭제 룰렛팬 / 커피 쿠폰 / 3", true),
	"룰렛팬님의 커피 쿠폰 킵 3개를 삭제했어요. (1개 남음)",
);
assert.equal(store.deleteRouletteKeeps(firstSessionId, [
	{ userId: "roulette-user", itemLabel: "커피 쿠폰" },
	{ userId: "roulette-user", itemLabel: "노래 신청권" },
]), true);
assert.deepEqual(store.listRouletteKeeps(firstSessionId), []);
assert.deepEqual(
	store.getRouletteKeepCommandRepliesByKey(firstSessionKey, "!내 킵", "roulette-user", "룰렛팬"),
	["룰렛팬님은 아직 킵이 없어요."],
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
	/^게임 참가자님은 이미 참여했어요\.$/,
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
assert.match(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-1", "추첨 참가자 1"), /응모 완료/);
assert.equal(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-1", "추첨 참가자 1"), "추첨 참가자 1님은 이미 응모했어요.");
assert.match(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-2", "추첨 참가자 2"), /응모 완료/);
assert.match(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-3", "추첨 참가자 3"), /응모 완료/);
const finishedRaffle = store.finishRaffleRound(firstSessionId, () => 0);
assert.equal(finishedRaffle.active, false);
assert.equal(finishedRaffle.entries.filter((entry) => entry.winner).length, 3);
assert.deepEqual(finishedRaffle.entries.filter((entry) => entry.winner).map((entry) => entry.userId), ["raffle-1", "raffle-2", "raffle-3"]);
assert.equal(store.applyRaffleCommand(firstSessionKey, "!참여", false, "raffle-4", "늦은 참가자"), "지금 진행 중인 추첨이 없어요.");
assert.equal(store.listRaffleRounds(firstSessionId)[0].roundId, 1);

assert.equal(store.startQuizRound(firstSessionId, "", "정답"), false);
assert.equal(store.startQuizRound(firstSessionId, "대한민국의 수도는?", "서울", 10_000), true);
assert.equal(store.startQuizRound(firstSessionId, "다음 문제", "다음 정답"), false);
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 부산", false, "quiz-1", "퀴즈 참가자 1", 11_000), "퀴즈 참가자 1님 답 접수!");
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 부산", false, "quiz-1", "퀴즈 참가자 1", 12_000), "퀴즈 참가자 1님, 같은 답을 이미 냈어요.");
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 인천", false, "quiz-2", "퀴즈 참가자 2", 11_500), "퀴즈 참가자 2님 답 접수!");
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 대구", false, "quiz-1", "퀴즈 참가자 1", 11_500), "퀴즈 참가자 1님 답 접수!");
assert.deepEqual(store.getQuizRoundByKey(firstSessionKey).submissions.map((entry) => entry.userId), ["quiz-2", "quiz-1"]);
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 서울", false, "quiz-2", "퀴즈 참가자 2", 13_500), "퀴즈 참가자 2님 답 접수!");
assert.equal(store.getQuizRoundByKey(firstSessionKey).active, true);
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 서울", false, "quiz-1", "퀴즈 참가자 1", 13_500), "퀴즈 참가자 1님 답 접수!");
const finishedQuiz = store.finishQuizRound(firstSessionId, 15_000);
assert.equal(finishedQuiz.active, false);
assert.equal(finishedQuiz.winnerUserId, "quiz-2");
assert.equal(finishedQuiz.winnerNickname, "퀴즈 참가자 2");
assert.equal(finishedQuiz.elapsedMs, 3_500);
assert.deepEqual(finishedQuiz.submissions.filter((entry) => entry.correct).map((entry) => entry.userId), ["quiz-2", "quiz-1"]);
assert.deepEqual(store.formatQuizResultMessages(finishedQuiz), [
	"[퀴즈] 종료! 정답: 서울\n첫 정답: 퀴즈 참가자 2 (3.5초)\n첫 정답: 퀴즈 참가자 1 (3.5초)",
]);
assert.equal(store.applyQuizCommand(firstSessionKey, "!정답 서울", false, "quiz-3", "늦은 참가자"), "지금 진행 중인 퀴즈가 없어요.");

assert.deepEqual(store.startNextQueuedQuizByKey(firstSessionKey), { kind: "empty" });
assert.equal(store.addQuizQueueItem(firstSessionId, "", "정답"), "invalid");
assert.equal(store.addQuizQueueItem(firstSessionId, "첫 대기 문제", "하나"), "added");
assert.equal(store.addQuizQueueItem(firstSessionId, "둘째 대기 문제", "둘"), "added");
const queuedQuizzes = store.listQuizQueue(firstSessionId);
assert.deepEqual(queuedQuizzes.map((item) => item.question), ["첫 대기 문제", "둘째 대기 문제"]);
assert.deepEqual(store.startNextQueuedQuizByKey(firstSessionKey, 30_000), { kind: "started", question: "첫 대기 문제" });
assert.deepEqual(store.startNextQueuedQuizByKey(firstSessionKey), { kind: "already_active" });
assert.equal(store.listQuizQueue(firstSessionId).length, 1);
assert.equal(store.getQuizRoundByKey(firstSessionKey).answer, "하나");
assert.equal(store.finishQuizRoundByKey(firstSessionKey, 31_000).active, false);
assert.equal(store.deleteQuizQueueItem(firstSessionId, queuedQuizzes[1].id), true);
assert.deepEqual(store.listQuizQueue(firstSessionId), []);
assert.equal(store.addQuizQueueItem(firstSessionId, "백업용 대기 문제", "백업"), "added");

const settings = store.getBotSettings(firstSessionId);
const commandReplies = store.getAvailableCommandRepliesByKey(firstSessionKey);
assert.match(commandReplies.join(" "), /사용할 수 있는 명령어:/);
assert.match(commandReplies.join(" "), /DJ 전용:\n!실드 \+N\/-N\n!신청곡 삭제 번호/);
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
assert.match(populatedCommandReplies, /DJ 전용:/);
assert.doesNotMatch(populatedCommandReplies, /영구 명령어|수정된 응답|실드 0개/);
assert.match(store.getAvailableCommandRepliesByKey(firstSessionKey).join(" "), /!테스트/);
assert.equal(store.getBotSettings(firstSessionId).followEnabled, true);
store.updateBotSettings(firstSessionId, { ...store.getBotSettings(firstSessionId), followEnabled: false, followMessage: "{nickname}님 팔로우 고마워요" });
assert.equal(store.getBotSettings(firstSessionId).followEnabled, false);
assert.equal(store.getBotSettings(firstSessionId).followMessage, "{nickname}님 팔로우 고마워요");
const shield = store.listBotCounters(firstSessionId).find((counter) => counter.name === "실드");
assert.equal(store.saveBotCounter(firstSessionId, shield.id, shield.name, 5), true);
assert.equal(store.applyBotCounterCommand(firstSessionKey, "!실드 +2", true), "실드 7개 남았어요.");
assert.equal(store.listBotCounters(firstSessionId).find((counter) => counter.id === shield.id).value, 7);
assert.deepEqual(
	store.applySongRequestCommand(firstSessionKey, "!신청곡 목록", false, "청취자 A"),
	["아직 신청곡이 없어요."],
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
assert.equal(coreBackup.data.tables.quiz_rounds.length, 2);
assert.equal(coreBackup.data.tables.quiz_queue.length, 1);
assert.deepEqual(coreBackup.data.tables.follow_settings.map((row) => ({ ...row })), [{ enabled: 0, message: "{nickname}님 팔로우 고마워요" }]);
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
// A display name the DJ typed is kept; chat only fills in a blank one.
store.updateBotSettings(secondSessionId, { ...store.getBotSettings(secondSessionId), djNickname: "직접 입력한 이름" });
store.linkDjWorkspaceByKey(secondSessionKey, "dj-user-id", "스푼 닉네임");
assert.equal(store.getBotSettings(secondSessionId).djNickname, "직접 입력한 이름");
store.updateBotSettings(secondSessionId, { ...store.getBotSettings(secondSessionId), djNickname: "" });
store.linkDjWorkspaceByKey(secondSessionKey, "dj-user-id", "DJ 나구");
assert.equal(store.getBotSettings(secondSessionId).djNickname, "DJ 나구");

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
assert.deepEqual(mergedQuizRounds.map((round) => [round.roundId, round.active]), [[3, true], [2, false], [1, false]]);
assert.deepEqual(store.listQuizQueue(secondSessionId).map((item) => item.question), ["백업용 대기 문제"]);
assert.equal(mergedQuizRounds[0].submissions[0].nickname, "재접속 퀴즈 참가자");
assert.equal(store.finishQuizRound(secondSessionId, 22_000).roundId, 3);
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

// Login-time linking (GET /v1/me): a fresh browser reaches the DJ's saved data at once.
const loginDj = "login-dj-id";
const loginA = "login-session-a";
store.saveSession(loginA, token);
const loginAKey = store.getSessionKey(loginA);
assert.equal(store.isWorkspaceLinkedByKey(loginAKey), false);
store.linkDjWorkspaceByKey(loginAKey, loginDj, null);
assert.equal(store.isWorkspaceLinkedByKey(loginAKey), true);
assert.equal(store.getSessionDjUserIdByKey(loginAKey), loginDj);
store.upsertBotCommand(loginA, "!로그인", "저장된 응답");
const loginB = "login-session-b";
store.saveSession(loginB, token);
store.linkDjWorkspaceByKey(store.getSessionKey(loginB), loginDj, null);
assert.ok(store.listBotCommands(loginB).some((command) => command.command === "!로그인"));

// One bot per DJ across devices: the phone session resolves to the PC's bot.
const loginBKey = store.getSessionKey(loginB);
assert.equal(store.getWorkspaceBotSessionKey(loginBKey), null);
store.setBotEnabled(loginA, true);
assert.equal(store.getWorkspaceBotSessionKey(loginBKey), loginAKey);
assert.deepEqual(store.listOtherWorkspaceSessionKeys(loginAKey), [loginBKey]);
store.setBotEnabled(loginB, true);
assert.equal(store.getWorkspaceBotSessionKey(loginBKey), loginBKey);
const restoredLoginBots = store.listEnabledBotSessions()
	.filter(({ sessionKey }) => sessionKey === loginAKey || sessionKey === loginBKey);
assert.equal(restoredLoginBots.length, 1, "only one bot per DJ is restored");
store.setBotEnabled(loginA, false);
store.setBotEnabled(loginB, false);

// A browser previously used by another DJ is never handed to the next DJ.
assert.equal(store.sessionBelongsToOtherDj(loginAKey, loginDj), false);
assert.equal(store.sessionBelongsToOtherDj(loginAKey, "other-dj-id"), true);
store.linkDjWorkspaceByKey(loginAKey, "other-dj-id", "다른 DJ");
assert.equal(store.getSessionDjUserIdByKey(loginAKey), "other-dj-id");
assert.equal(store.listBotCommands(loginA).some((command) => command.command === "!로그인"), false);
assert.ok(store.listBotCommands(loginB).some((command) => command.command === "!로그인"));

// Batched acknowledgements: an accepted entry goes to the callback, not a reply.
const ackedNames = [];
assert.equal(store.startRaffleRound(loginB, 1), true);
assert.equal(store.applyRaffleCommand(loginBKey, "!참여", false, "ack-1", "묶음 참가자", (name) => ackedNames.push(name)), null);
assert.deepEqual(ackedNames, ["묶음 참가자"]);
assert.equal(store.applyRaffleCommand(loginBKey, "!참여", false, "ack-1", "묶음 참가자", (name) => ackedNames.push(name)), "묶음 참가자님은 이미 응모했어요.");
store.finishRaffleRound(loginB, () => 0);

// A donation recovered from the donations API and the same donation from the
// stream (different ids) count once: Spoon identifies donations by donor + time.
const streamDonation = { event: "donation", id: "stream-id-1", data: { user: { id: "donor-1", nickname: "후원자" }, amount: 300, message: "응원해요", time: "2026-10-19T05:47:50.512Z" } };
const apiDonation = { event: "donation", id: "donation:donor-1:2026-10-19T05:47:50.512Z", data: { user: { id: "donor-1", nickname: "후원자" }, amount: 300, message: null, time: "2026-10-19T05:47:50.512Z" } };
assert.equal(store.recordAudienceEvent(loginBKey, 777, apiDonation), true);
assert.equal(store.recordAudienceEvent(loginBKey, 777, streamDonation), false);

// One token set per DJ: a login hands its token to the DJ's other sessions and
// reports their old refresh tokens; a refresh propagates; disconnect signs out all.
const peerA = "token-peer-a";
const peerB = "token-peer-b";
store.saveSession(peerA, { ...token, access_token: "old-access", refresh_token: "old-refresh" });
store.linkDjWorkspaceByKey(store.getSessionKey(peerA), "token-dj", null);
store.saveSession(peerB, { ...token, access_token: "new-access", refresh_token: "new-refresh" });
store.linkDjWorkspaceByKey(store.getSessionKey(peerB), "token-dj", null);
assert.deepEqual(store.adoptTokenForDjSessions(store.getSessionKey(peerB)), ["old-refresh"]);
assert.equal(store.getSession(peerA).refresh_token, "new-refresh");
store.updateSessionByKey(store.getSessionKey(peerA), { ...token, access_token: "rotated-access", refresh_token: "rotated-refresh" });
assert.equal(store.getSession(peerB).refresh_token, "rotated-refresh");
assert.equal(store.getTokenGroupKey(store.getSessionKey(peerA)), store.getTokenGroupKey(store.getSessionKey(peerB)));
store.invalidateDjSessionsByKey(store.getSessionKey(peerA));
assert.equal(store.getSession(peerA), null);
assert.equal(store.getSession(peerB), null);

// Secret word: queued in advance, first listener whose chat contains it wins.
assert.equal(store.normalizeSecretText("고 구 마!! 🍠"), "고구마");
assert.equal(store.addSecretWord(firstSessionId, "  ", ""), "invalid");
assert.equal(store.addSecretWord(firstSessionId, "고구마", "겨울 간식"), "added");
assert.equal(store.addSecretWord(firstSessionId, "Spoon", ""), "added");
assert.deepEqual(store.startNextSecretWordByKey(firstSessionKey, 1_000), { kind: "started", length: 3 });
assert.deepEqual(store.startNextSecretWordByKey(firstSessionKey), { kind: "already_active" });
assert.equal(store.applySecretWordChat(firstSessionKey, "고구마 맛있다", true, "dj", "DJ"), null, "DJ chat is not judged");
assert.equal(store.applySecretWordChat(firstSessionKey, "감자 좋아요", false, "fan-1", "팬1"), null);
const found = store.applySecretWordChat(firstSessionKey, "저는 고 구 마! 먹었어요", false, "fan-2", "팬2", 6_000);
assert.equal(found.winnerNickname, "팬2");
assert.equal(found.foundAt - found.startedAt, 5_000);
assert.equal(store.applySecretWordChat(firstSessionKey, "고구마", false, "fan-3", "팬3"), null, "only the first finder wins");
assert.equal(store.getActiveSecretWordByKey(firstSessionKey), null);
assert.deepEqual(store.startNextSecretWordByKey(firstSessionKey, 7_000), { kind: "started", length: 5 });
assert.ok(store.applySecretWordChat(firstSessionKey, "i love SPOON", false, "fan-4", "팬4"), "case is ignored");
assert.deepEqual(store.startNextSecretWordByKey(firstSessionKey), { kind: "empty" });
store.addSecretWord(firstSessionId, "노을", "");
store.startNextSecretWordByKey(firstSessionKey);
assert.equal(store.finishSecretWordByKey(firstSessionKey).word, "노을");
assert.equal(store.finishSecretWordByKey(firstSessionKey), null);
assert.deepEqual(store.listSecretWordRounds(firstSessionId).map((round) => [round.word, round.winnerNickname]), [["노을", null], ["Spoon", "팬4"], ["고구마", "팬2"]]);

// Team battle: join once, points from hearts/spoons, lead change, goal.
assert.equal(store.saveTeamBattleSettings(firstSessionId, { teamNames: ["혼자"], metric: "both", goal: 0 }), false);
assert.equal(store.saveTeamBattleSettings(firstSessionId, { teamNames: ["A팀", "a팀"], metric: "both", goal: 0 }), false, "names must differ");
assert.equal(store.saveTeamBattleSettings(firstSessionId, { teamNames: ["A팀", "B팀", ""], metric: "both", goal: 300 }), true);
assert.deepEqual(store.getTeamBattleSettings(firstSessionId), { teamNames: ["A팀", "B팀"], metric: "both", goal: 300 });
assert.equal(store.resolveTeamIndex(["A팀", "B팀"], "a"), 0);
assert.equal(store.resolveTeamIndex(["A팀", "B팀"], "2"), 1);
assert.equal(store.resolveTeamIndex(["A팀", "B팀"], "팀"), -1, "ambiguous prefix");
assert.equal(store.applyTeamCommand(firstSessionKey, "!팀 1", false, "t1", "팀원1"), "지금 진행 중인 팀 대항전이 없어요.");
assert.equal(store.startTeamBattleByKey(firstSessionKey, 100_000).kind, "started");
assert.equal(store.startTeamBattleByKey(firstSessionKey).kind, "already_active");
const joined = [];
assert.equal(store.applyTeamCommand(firstSessionKey, "!팀 1", false, "t1", "팀원1", (name, team) => joined.push([name, team])), null);
assert.equal(store.applyTeamCommand(firstSessionKey, "!팀 b", false, "t2", "팀원2"), "팀원2님 B팀 참여 완료!");
assert.equal(store.applyTeamCommand(firstSessionKey, "!팀 2", false, "t1", "팀원1"), "팀원1님은 이미 A팀 소속이에요.");
assert.match(store.applyTeamCommand(firstSessionKey, "!팀 9", false, "t3", "팀원3"), /팀을 찾지 못했어요/);
assert.equal(store.applyTeamCommand(firstSessionKey, "!팀 1", true, "dj", "DJ"), "DJ는 팀에 참여할 수 없어요.");
assert.deepEqual(joined, [["팀원1", "A팀"]]);
assert.equal(store.addTeamBattlePoints(firstSessionKey, "outsider", "hearts", 50, 101_000), null, "non-members score nothing");
assert.equal(store.addTeamBattlePoints(firstSessionKey, "t1", "hearts", 10, 101_000), null, "first leader is not announced");
assert.equal(store.addTeamBattlePoints(firstSessionKey, "t2", "spoons", 5, 102_000), null, "lead change within a minute is quiet");
assert.equal(store.addTeamBattlePoints(firstSessionKey, "t2", "hearts", 1, 103_000, 0), null, "events before joining do not count");
const lead = store.addTeamBattlePoints(firstSessionKey, "t2", "hearts", 1, 200_000);
assert.equal(lead.kind, "lead_change", "a quiet lead change is announced once the minute has passed");
assert.equal(lead.leader.name, "B팀");
assert.equal(store.addTeamBattlePoints(firstSessionKey, "t2", "hearts", 1, 300_000), null, "same leader is not repeated");
assert.deepEqual(store.getActiveTeamBattleByKey(firstSessionKey).teams.map((team) => team.score), [10, 52]);
const goal = store.addTeamBattlePoints(firstSessionKey, "t2", "spoons", 30, 210_000);
assert.equal(goal.kind, "goal_reached");
assert.equal(goal.winner.name, "B팀");
assert.equal(store.getActiveTeamBattleByKey(firstSessionKey), null, "reaching the goal ends the battle");
assert.equal(store.finishTeamBattleByKey(firstSessionKey), null);
const history = store.listTeamBattles(firstSessionId);
assert.equal(history[0].winnerIndex, 1);
assert.equal(history[0].topMembers[0].nickname, "팀원2");
assert.equal(history[0].topMembers[0].points, 352);

// Attendance: once per broadcast, streak by broadcasts, milestones, ranking.
const attendanceNow = Date.now();
for (let live = 1; live <= 5; live += 1) store.recordBroadcastByKey(firstSessionKey, 9000 + live, attendanceNow - (10 - live) * 60_000);
store.recordBroadcastByKey(firstSessionKey, 9001, 0);
for (const live of [9001, 9003, 9004]) assert.ok(store.markAttendanceByKey(firstSessionKey, live, "a1", "출석러", attendanceNow));
assert.equal(store.markAttendanceByKey(firstSessionKey, 9004, "a1", "출석러"), null, "once per broadcast");
assert.deepEqual(store.markAttendanceByKey(firstSessionKey, 9005, "a1", "출석러 새닉", attendanceNow), { total: 4, streak: 3 });
assert.deepEqual(store.getAttendanceSummaryByKey(firstSessionKey, "a1"), { total: 4, streak: 3 });
store.markAttendanceByKey(firstSessionKey, 9005, "a2", "하루", attendanceNow);
assert.equal(store.attendanceMilestoneLabel({ total: 10, streak: 2 }), "10번째 출석");
assert.equal(store.attendanceMilestoneLabel({ total: 30, streak: 5 }), "30번째 출석 · 연속 5회");
assert.equal(store.attendanceMilestoneLabel({ total: 4, streak: 3 }), null);
const attendanceRanking = store.listAttendanceRankingByKey(firstSessionKey, "month");
assert.deepEqual(attendanceRanking.map((entry) => [entry.nickname, entry.count]), [["출석러 새닉", 4], ["하루", 1]]);
assert.equal(store.applyAttendanceCommand(firstSessionKey, "!출석", "a1", "출석러"), "출석러님은 지금까지 4번 출석했어요. (연속 3회)");
assert.equal(store.applyAttendanceCommand(firstSessionKey, "!출석", "nobody", "새손님"), "새손님님은 아직 출석 기록이 없어요.");
assert.match(store.applyAttendanceCommand(firstSessionKey, "!출석왕", "a1", "출석러"), /^\[출석왕\] 이번 달: 1\. 출석러 새닉 4회/);
assert.equal(store.applyAttendanceCommand(firstSessionKey, "!출석 해요", "a1", "출석러"), null);
// In a broadcast: first !출석 confirms, later ones say already attended.
assert.equal(store.applyAttendanceCommand(firstSessionKey, "!출석", "a1", "출석러", 9005), "[출석] 출석러님 출석 완료! 연속 3회 (누적 4회)");
assert.equal(store.applyAttendanceCommand(firstSessionKey, "!출석", "a1", "출석러", 9005), "[출석] 출석러님은 이미 출석했어요. 연속 3회 (누적 4회)");
assert.equal(store.applyAttendanceCommand(firstSessionKey, "!출석", "a2", "하루", 9005), "[출석] 하루님 출석 완료! 연속 1회 (누적 1회)");
{
  const { formatAckMessages } = await import("../src/lib/chat-acks.ts");
  assert.deepEqual(formatAckMessages("[가위바위보] 참여 완료!", ["GULING", "청취자2"]), ["[가위바위보] 참여 완료! (GULING, 청취자2)"]);
  const many = formatAckMessages("[추첨] 응모 완료!", Array.from({ length: 40 }, (_, index) => `청취자${index}`));
  assert.ok(many.length > 1 && many.every((message) => message.length <= 200 && message.startsWith("[추첨] 응모 완료! (")));
  assert.equal(many.join("").split("청취자").length - 1, 40);
}
assert.equal(store.getAttendanceAnnounceByKey(firstSessionKey), true);
store.setAttendanceAnnounce(firstSessionId, false);
assert.equal(store.getAttendanceAnnounceByKey(firstSessionKey), false);

// Game history reset: finished records only, running rounds and queues stay.
assert.ok(store.listTeamBattles(firstSessionId).length > 0);
assert.equal(store.startTeamBattleByKey(firstSessionKey).kind, "started");
assert.ok(store.resetGameHistory(firstSessionId, "team") > 0);
assert.deepEqual(store.listTeamBattles(firstSessionId).map((battle) => battle.active), [true], "the running battle survives");
store.finishTeamBattleByKey(firstSessionKey);
assert.ok(store.listAttendanceRankingByKey(firstSessionKey, "all").length > 0);
store.resetGameHistory(firstSessionId, "attendance");
assert.equal(store.listAttendanceRankingByKey(firstSessionKey, "all").length, 0);
assert.ok(store.resetGameHistory(firstSessionId, "secret") > 0);
assert.equal(store.resetGameHistory(firstSessionId, "secret"), 0, "second reset removes nothing");

// Admin block by DJ: every device of the DJ and later logins are blocked.
store.saveSession("block-a", token);
store.linkDjWorkspaceByKey(store.getSessionKey("block-a"), "block-dj", null);
store.saveSession("block-b", token);
store.linkDjWorkspaceByKey(store.getSessionKey("block-b"), "block-dj", null);
const blockedKeys = store.setSessionBlockedByKey(store.getSessionKey("block-a"), true);
assert.equal(blockedKeys.length, 2);
assert.equal(store.isSessionBlocked("block-b"), true);
assert.equal(store.isDjBlocked("block-dj"), true);
store.saveSession("block-c", token);
store.linkDjWorkspaceByKey(store.getSessionKey("block-c"), "block-dj", null);
assert.equal(store.isSessionBlocked("block-c"), true, "a later session of a blocked DJ is blocked");
assert.equal(store.listAdminSessions().find((row) => row.sessionKey === store.getSessionKey("block-a")).djUserId, "block-dj");
store.setSessionBlockedByKey(store.getSessionKey("block-b"), false);
assert.equal(store.isDjBlocked("block-dj"), false);
assert.equal(["block-a", "block-b", "block-c"].some((id) => store.isSessionBlocked(id)), false);
store.saveSession("unknown-dj", token);
assert.deepEqual(store.setSessionBlockedByKey(store.getSessionKey("unknown-dj"), true), [store.getSessionKey("unknown-dj")]);

// Maintenance: compacting old audience history keeps all-time totals intact.
const totalsByUser = (entries) => Object.fromEntries(entries.map((e) => [e.userId, [e.spoons, e.hearts]]).sort());
const allBefore = totalsByUser(store.listAudienceRankings(firstSessionId, "all"));
assert.ok(Object.keys(allBefore).length > 0);
assert.ok(store.compactAudienceHistory(Date.now() + 86_400_000) > 0);
assert.deepEqual(totalsByUser(store.listAudienceRankings(firstSessionId, "all")), allBefore);
assert.equal(store.compactAudienceHistory(Date.now() + 86_400_000), 0);
assert.deepEqual(store.listAudienceRankings(firstSessionId, "daily"), []);

// Maintenance: stale signed-out sessions and old roulette results are removed.
store.saveSession("stale-session", token);
store.invalidateStoredAuthSession("stale-session");
assert.equal(store.deleteStaleSessions(Date.now() + 1_000) >= 1, true);
assert.equal(store.isBotEnabled("stale-session"), false);
assert.equal(store.deleteOldRouletteResults(0), 0);

// Maintenance: one backup per day, written atomically, old ones rotated.
const maintenance = await import("../src/lib/maintenance.ts");
const firstBackup = maintenance.runDailyBackup(Date.parse("2026-10-01T03:00:00Z"));
assert.equal(firstBackup, "nagu-2026-10-01.db");
assert.equal(maintenance.runDailyBackup(Date.parse("2026-10-01T05:00:00Z")), null);
const { readdirSync } = await import("node:fs");
for (let day = 2; day <= 9; day += 1) maintenance.runDailyBackup(Date.parse(`2026-10-0${day}T03:00:00Z`.replace("0-10", "-10")));
const backupFiles = readdirSync(maintenance.backupsDirectory()).filter((name) => name.endsWith(".db"));
assert.equal(backupFiles.length, 7);
assert.ok(!backupFiles.includes("nagu-2026-10-01.db"));
assert.equal(store.getAppState("maintenance:last_backup") !== null, true);
// The daily file is a complete, readable copy of the live database.
{
  const { DatabaseSync } = await import("node:sqlite");
  const { join: joinPath } = await import("node:path");
  const latest = backupFiles.sort().at(-1);
  const copy = new DatabaseSync(joinPath(maintenance.backupsDirectory(), latest), { readOnly: true });
  assert.equal(copy.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  const live = new DatabaseSync(store.getDatabasePath(), { readOnly: true });
  const tableNames = live.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
  assert.deepEqual(copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name), tableNames);
  for (const table of ["oauth_sessions", "bot_settings", "attendance", "team_battles", "secret_word_rounds"]) {
    assert.ok(tableNames.includes(table), table);
  }
  copy.close();
  live.close();
}
assert.notEqual(maintenance.runDailyCleanup(), null);
assert.equal(maintenance.runDailyCleanup(), null);

// Alerts: posted to the webhook as Discord/Slack-compatible JSON, at most once
// per kind per 30 minutes.
const { createServer } = await import("node:http");
const alertBodies = [];
const webhook = createServer((request, response) => {
	let body = "";
	request.on("data", (chunk) => { body += chunk; });
	request.on("end", () => { alertBodies.push(JSON.parse(body)); response.end("ok"); });
});
await new Promise((resolve) => webhook.listen(0, "127.0.0.1", resolve));
process.env.ALERT_WEBHOOK_URL = `http://127.0.0.1:${webhook.address().port}/hook`;
const alerts = await import("../src/lib/alerts.ts");
const quietError = console.error;
console.error = () => {};
alerts.sendAlert("test-kind", "첫 알림");
alerts.sendAlert("test-kind", "30분 안의 같은 종류");
alerts.sendAlert("other-kind", "다른 종류");
console.error = quietError;
await new Promise((resolve) => setTimeout(resolve, 300));
webhook.close();
assert.equal(alertBodies.length, 2);
assert.equal(alertBodies[0].content, alertBodies[0].text);
assert.match(alertBodies.map((body) => body.content).join(" "), /첫 알림.*다른 종류|다른 종류.*첫 알림/);

console.log("Persistent ranking checks passed: restore, deduplication, period totals, login linking, multi-device bots, acks, donation recovery, and shared tokens");