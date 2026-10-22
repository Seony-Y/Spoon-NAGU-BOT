// End-to-end CRUD check: real HTTP requests against the production build on a
// throwaway SQLite file with throwaway secrets, verified through the store.
// Requires `npm run build` first; run with `npm run test:e2e`.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Windows keeps this process's own SQLite handle open until exit, so each run
// removes files left by earlier runs instead of its own.
for (const name of readdirSync(tmpdir()).filter((n) => n.startsWith("nagu-e2e-"))) {
  try { rmSync(join(tmpdir(), name), { force: true }); } catch {}
}
const dbPath = join(tmpdir(), `nagu-e2e-${process.pid}.db`);
// Process env wins over .env files in Next, so the server uses these too.
process.env.SESSION_SECRET = randomBytes(32).toString("base64url");
process.env.ADMIN_PASSWORD = randomBytes(16).toString("hex");
process.env.ACCESS_CODE = randomBytes(8).toString("hex");
process.env.SESSION_STORE_PATH = dbPath;
const { ADMIN_PASSWORD } = process.env;

const store = await import(pathToFileURL(join(process.cwd(), "src/lib/session-store.ts")).href);
const sessionId = "e2e-session-id";
const allScopes = "live.read events.chat events.presence events.like events.donation chat.send listeners.read fans.read me.read events.follow dj.follow donations.read";
// The token is fake: anything that reaches Spoon gets a 401, the refresh fails,
// and the app correctly signs the session out. Re-seed before each request.
const reseed = () => store.saveSession(sessionId, { access_token: "e2e-access", token_type: "Bearer", expires_in: 86_400, refresh_token: "e2e-refresh", scope: allScopes });
reseed();
const sessionKey = store.getSessionKey(sessionId);
store.linkDjWorkspaceByKey(sessionKey, "e2e-dj", null);

const PORT = 3210;
const BASE = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, SESSION_STORE_PATH: dbPath, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail }); };
const cookie = `nagu_session=${sessionId}`;

async function post(path, fields, { asJson = false, headers = {} } = {}) {
  reseed();
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) body.append(key, String(v));
  }
  const response = await fetch(BASE + path, { method: "POST", body, redirect: "manual", headers: { cookie, ...headers } });
  if (asJson) return { status: response.status, json: await response.json().catch(() => null) };
  const location = response.headers.get("location") ?? "";
  return { status: response.status, params: Object.fromEntries(location ? new URL(location).searchParams : []) };
}

try {
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  // --- Read: pages render with the session -----------------------------------
  for (const path of ["/", "/?tab=bot&automation=follow", "/?tab=bot&automation=commands", "/?tab=game&game=quiz", "/?tab=game&game=roulette", "/?tab=backup", "/remote", "/guide"]) {
    reseed();
    const response = await fetch(BASE + path, { headers: { cookie } });
    const html = await response.text();
    check(`GET ${path}`, response.status === 200 && !html.includes("화면을 불러오지 못했습니다"), `status ${response.status}`);
  }

  // --- Settings: DJ name and automation features ----------------------------
  let r = await post("/bot/settings", { mode: "dj_nickname", djNickname: "나구테스트", automation: "welcome" });
  check("DJ 이름 저장", r.params.settings === "nickname_saved" && store.getBotSettings(sessionId).djNickname === "나구테스트", JSON.stringify(r.params));

  const features = {
    welcome: ["welcomeEnabled", "greetingMessage"],
    donation: ["donationEnabled", "donationMessage"],
    heart: ["heartEnabled", "heartMessage"],
    follow: ["followEnabled", "followMessage"],
    repeat: ["repeatEnabled", "repeatMessage"],
  };
  for (const [feature, [enabledKey, messageKey]] of Object.entries(features)) {
    const message = `${feature} 테스트 {nickname}`;
    r = await post("/bot/settings", { mode: "automation_feature", feature, enabled: "on", message, intervalMinutes: 15 });
    const settings = store.getBotSettings(sessionId);
    check(`자동화 저장: ${feature}`, r.params.settings === "feature_saved" && settings[enabledKey] === true && settings[messageKey] === message, JSON.stringify(r.params));
  }
  check("반복 공지 간격", store.getBotSettings(sessionId).repeatIntervalMinutes === 15);
  r = await post("/bot/settings", { mode: "automation_feature", feature: "repeat", message: "x", intervalMinutes: 0 });
  check("반복 간격 검증(0분 거부)", r.params.settings === "invalid_interval", JSON.stringify(r.params));
  const toggle = await post("/bot/settings", { mode: "automation_toggle", feature: "heart", enabled: "false" }, { asJson: true });
  check("자동화 스위치(즉시 반영)", toggle.status === 200 && store.getBotSettings(sessionId).heartEnabled === false, JSON.stringify(toggle));

  // --- Commands: create, update, delete, guards -----------------------------
  r = await post("/bot/settings", { mode: "upsert_command", command: "!규칙", response: "규칙 안내" });
  check("명령어 추가", r.params.settings === "command_saved" && store.listBotCommands(sessionId).some((c) => c.command === "!규칙"), JSON.stringify(r.params));
  r = await post("/bot/settings", { mode: "update_command", originalCommand: "!규칙", command: "!룰", response: "바뀐 안내" });
  const commands = store.listBotCommands(sessionId);
  check("명령어 수정", r.params.settings === "command_updated" && commands.some((c) => c.command === "!룰" && c.response === "바뀐 안내") && !commands.some((c) => c.command === "!규칙"), JSON.stringify(r.params));
  r = await post("/bot/settings", { mode: "delete_command", command: "!룰" });
  check("명령어 삭제", r.params.settings === "command_deleted" && !store.listBotCommands(sessionId).some((c) => c.command === "!룰"), JSON.stringify(r.params));
  r = await post("/bot/settings", { mode: "upsert_command", command: "!봇", response: "x" });
  check("예약 명령어 거부(!봇)", r.params.settings === "reserved_command", JSON.stringify(r.params));

  // --- Counters: create, update, delete, guards -----------------------------
  r = await post("/bot/settings", { mode: "save_counter", name: "펀딩", value: 5 });
  let funding = store.listBotCounters(sessionId).find((c) => c.name === "펀딩");
  check("카운터 추가", r.params.settings === "counter_saved" && funding?.value === 5, JSON.stringify(r.params));
  r = await post("/bot/settings", { mode: "save_counter", id: funding.id, name: "펀딩", value: 9 });
  funding = store.listBotCounters(sessionId).find((c) => c.id === funding.id);
  check("카운터 수정", r.params.settings === "counter_saved" && funding?.value === 9, JSON.stringify(r.params));
  r = await post("/bot/settings", { mode: "upsert_command", command: "!펀딩", response: "x" });
  check("카운터와 같은 이름 명령어 거부", r.params.settings === "command_counter_conflict", JSON.stringify(r.params));
  r = await post("/bot/settings", { mode: "save_counter", name: "참여", value: 1 });
  check("기본 명령어 이름 카운터 거부", r.params.settings === "counter_name_taken", JSON.stringify(r.params));
  r = await post("/bot/settings", { mode: "delete_counter", id: funding.id });
  check("카운터 삭제", r.params.settings === "counter_deleted" && !store.listBotCounters(sessionId).some((c) => c.id === funding.id), JSON.stringify(r.params));
  const shield = store.listBotCounters(sessionId).find((c) => c.name === "실드");
  r = await post("/bot/settings", { mode: "delete_counter", id: shield.id });
  check("기본 카운터(실드) 삭제 방지", store.listBotCounters(sessionId).some((c) => c.name === "실드"), JSON.stringify(r.params));

  // --- Song requests: create (chat), delete, clear --------------------------
  store.applySongRequestCommand(sessionKey, "!신청곡 밤편지-아이유", false, "청취자1");
  store.applySongRequestCommand(sessionKey, "!신청곡 좋은날-아이유", false, "청취자2");
  const requests = store.listSongRequests(sessionId);
  check("신청곡 추가(채팅)", requests.length === 2);
  r = await post("/bot/settings", { mode: "delete_song_request", id: requests[0].id });
  check("신청곡 삭제", store.listSongRequests(sessionId).length === 1, JSON.stringify(r.params));
  r = await post("/bot/settings", { mode: "clear_song_requests" });
  check("신청곡 전체 비우기", store.listSongRequests(sessionId).length === 0, JSON.stringify(r.params));

  // --- Quiz queue -------------------------------------------------------------
  r = await post("/game/quiz", { action: "queue_add", question: "수도는?", answer: "서울" });
  const queue = store.listQuizQueue(sessionId);
  check("퀴즈 대기 문제 추가", r.params.quiz === "queued" && queue.length === 1 && queue[0].answer === "서울", JSON.stringify(r.params));
  r = await post("/game/quiz", { action: "queue_add", question: "", answer: "x" });
  check("퀴즈 빈 문제 거부", r.params.quiz === "invalid_quiz", JSON.stringify(r.params));
  r = await post("/game/quiz", { action: "queue_delete", id: queue[0].id });
  check("퀴즈 대기 문제 삭제", r.params.quiz === "queue_deleted" && store.listQuizQueue(sessionId).length === 0, JSON.stringify(r.params));
  r = await post("/game/rps", { action: "start", choice: "random" });
  check("봇 없이 게임 시작 차단", r.params.rps === "bot_required", JSON.stringify(r.params));

  // --- Roulette: settings, prizes, keeps ------------------------------------
  r = await post("/game/roulette", { action: "settings", cost: 30, enabled: "on" });
  let roulette = store.getRouletteSettings(sessionId);
  check("룰렛 설정 저장", r.params.roulette === "settings_saved" && roulette.enabled && roulette.cost === 30, JSON.stringify(r.params));
  r = await post("/game/roulette", { action: "distribution", label: ["커피", "노래"], percentage: ["60", "40"] });
  let items = store.listRouletteItems(sessionId);
  check("룰렛 경품 추가", r.params.roulette === "distribution_saved" && items.length === 2, JSON.stringify(r.params) + JSON.stringify(items));
  r = await post("/game/roulette", { action: "distribution", label: ["커피", "노래"], percentage: ["70", "30"] });
  items = store.listRouletteItems(sessionId);
  check("룰렛 경품 확률 수정", r.params.roulette === "distribution_saved" && items.find((i) => i.label === "커피")?.weight === 7000, JSON.stringify(items));
  r = await post("/game/roulette", { action: "distribution", label: ["커피", "노래"], percentage: ["70", "40"] });
  check("룰렛 확률 100% 초과 거부", r.params.roulette === "invalid_distribution", JSON.stringify(r.params));
  r = await post("/game/roulette", { deleteId: items.find((i) => i.label === "노래").id });
  items = store.listRouletteItems(sessionId);
  check("룰렛 경품 삭제", r.params.roulette === "item_deleted" && items.length === 1 && items[0].label === "커피", JSON.stringify(r.params));
  await post("/game/roulette", { action: "distribution", label: ["커피"], percentage: ["100"] });
  const draw = store.applyRouletteDonation(sessionKey, 1, {
    event: "donation", id: "e2e-donation-1",
    data: { user: { id: "fan-1", nickname: "후원팬" }, amount: 30, message: null, time: "2026-10-22T00:00:00.000Z" },
  });
  check("룰렛 자동 추첨 → 킵 생성", draw && !draw.isMiss && store.listRouletteKeeps(sessionId).length === 1, JSON.stringify(draw));
  r = await post("/game/roulette", { action: "keeps", operation: "update", item: "0", "userId:0": "fan-1", "itemLabel:0": "커피", "count:0": "5" });
  check("킵 수량 수정", r.params.roulette === "keeps_updated" && store.listRouletteKeeps(sessionId)[0]?.count === 5, JSON.stringify(r.params));
  r = await post("/game/roulette", { action: "keeps", operation: "delete", selection: "0", "userId:0": "fan-1", "itemLabel:0": "커피", "count:0": "5" });
  check("킵 삭제", r.params.roulette === "keeps_deleted" && store.listRouletteKeeps(sessionId).length === 0, JSON.stringify(r.params));

  // --- Remote actions ---------------------------------------------------------
  r = await post("/remote/action", { action: "roulette", enabled: "false" });
  check("리모컨: 룰렛 끄기", r.params.r === "switch_saved" && !store.getRouletteSettings(sessionId).enabled, JSON.stringify(r.params));
  r = await post("/remote/action", { action: "automation", feature: "follow", enabled: "false" });
  check("리모컨: 팔로우 감사 끄기", r.params.r === "switch_saved" && !store.getBotSettings(sessionId).followEnabled, JSON.stringify(r.params));
  const shieldBefore = store.listBotCounters(sessionId).find((c) => c.name === "실드").value;
  r = await post("/remote/action", { action: "counter", id: shield.id, delta: 1 });
  check("리모컨: 카운터 +1", r.params.r === "counter_saved" && store.listBotCounters(sessionId).find((c) => c.name === "실드").value === shieldBefore + 1, JSON.stringify(r.params));

  // --- Backup: export, change, restore --------------------------------------
  reseed();
  const backupResponse = await fetch(`${BASE}/bot/backup`, { headers: { cookie } });
  const backupText = await backupResponse.text();
  check("백업 내려받기", backupResponse.status === 200 && backupText.includes("nagu-bot-workspace"), `status ${backupResponse.status}`);
  await post("/bot/settings", { mode: "dj_nickname", djNickname: "바뀐이름", automation: "welcome" });
  const form = new FormData();
  form.append("backup", new Blob([backupText], { type: "application/json" }), "backup.json");
  reseed();
  const restore = await fetch(`${BASE}/bot/backup`, { method: "POST", body: form, redirect: "manual", headers: { cookie } });
  const restoreStatus = new URL(restore.headers.get("location")).searchParams;
  check("백업 복원", [...restoreStatus.values()].includes("backup_restored") && store.getBotSettings(sessionId).djNickname === "나구테스트", [...restoreStatus].join("&"));

  // --- Admin: list, block (requests rejected), unblock ----------------------
  let admin = await post("/admin/session", { password: ADMIN_PASSWORD, mode: "list" }, { asJson: true });
  check("관리자: 세션 목록", admin.status === 200 && admin.json?.sessions?.some((s) => s.sessionKey === sessionKey), `status ${admin.status}`);
  admin = await post("/admin/session", { password: ADMIN_PASSWORD, mode: "block", sessionKey }, { asJson: true });
  r = await post("/bot/settings", { mode: "dj_nickname", djNickname: "차단중", automation: "welcome" });
  check("관리자: 차단 시 요청 거부", admin.status === 200 && r.params.settings === "authentication_required" && store.getBotSettings(sessionId).djNickname === "나구테스트", JSON.stringify(r.params));
  admin = await post("/admin/session", { password: ADMIN_PASSWORD, mode: "unblock", sessionKey }, { asJson: true });
  r = await post("/bot/settings", { mode: "dj_nickname", djNickname: "해제후", automation: "welcome" });
  check("관리자: 차단 해제 후 정상", admin.status === 200 && r.params.settings === "nickname_saved", JSON.stringify(r.params));
  const wrong = await post("/admin/session", { password: "wrong-password", mode: "list" }, { asJson: true });
  check("관리자: 틀린 비밀번호 거부", wrong.status === 401, `status ${wrong.status}`);

  // --- Malformed body ----------------------------------------------------------
  const malformed = await fetch(`${BASE}/game/quiz`, { method: "POST", body: "{not a form", headers: { cookie, "content-type": "application/json" }, redirect: "manual" });
  check("잘못된 요청 본문 → 500 아님", malformed.status === 303, `status ${malformed.status}`);
} finally {
  server.kill();
  const failed = results.filter((x) => !x.ok);
  for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.name}${x.ok ? "" : `  -> ${x.detail}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) console.log("--- server log tail ---\n" + serverLog.split("\n").slice(-30).join("\n"));
  setTimeout(() => process.exit(failed.length ? 1 : 0), 500);
}
