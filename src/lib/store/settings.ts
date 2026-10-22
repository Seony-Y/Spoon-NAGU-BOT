import "server-only";

import { formatMultilineMessages } from "../chat-message";
import { formatCounterAdjustment, parseCounterCommand } from "../counter-command";
import { parseSongRequestCommand } from "../song-request-command";
import { getDatabase, getSessionKey, getWorkspaceKey } from "./db";

type BotSettingsRow = {
  dj_nickname: string;
  greeting_message: string;
  donation_message: string;
  heart_message: string;
  hourly_enabled: number;
  hourly_message: string;
  repeat_interval_minutes: number;
  welcome_enabled: number;
  donation_enabled: number;
  heart_enabled: number;
  commands_initialized: number;
};

export type BotSettings = {
  djNickname: string;
  greetingMessage: string;
  donationMessage: string;
  heartMessage: string;
  repeatEnabled: boolean;
  repeatMessage: string;
  repeatIntervalMinutes: number;
  welcomeEnabled: boolean;
  donationEnabled: boolean;
  heartEnabled: boolean;
  followEnabled: boolean;
  followMessage: string;
};

export type BotCommand = {
  command: string;
  response: string;
};

export type BotCounter = {
  id: number;
  name: string;
  value: number;
};

export type SongRequest = {
  id: number;
  requesterNickname: string;
  title: string;
  artist: string;
  createdAt: number;
};

export function ensureBotSettings(sessionKey: string) {
  const database = getDatabase();
  const workspaceKey = getWorkspaceKey(sessionKey);
  database.prepare(`
    INSERT OR IGNORE INTO bot_settings (session_key, repeat_interval_minutes) VALUES (?, 10)
  `).run(workspaceKey);
  const settings = database.prepare("SELECT * FROM bot_settings WHERE session_key = ?")
    .get(workspaceKey) as BotSettingsRow;

  if (settings.commands_initialized === 0) {
    const insert = database.prepare(
      "INSERT OR IGNORE INTO bot_commands (session_key, command, response) VALUES (?, ?, ?)",
    );
    insert.run(workspaceKey, "!안녕", "{nickname}님, 반가워요!");
    insert.run(workspaceKey, "!명령어", "사용 가능한 명령어를 확인해 주세요.");
    database.prepare("UPDATE bot_settings SET commands_initialized = 1 WHERE session_key = ?")
      .run(workspaceKey);
  }
  database.prepare(`
    INSERT OR IGNORE INTO bot_counters (session_key, name, initial_value, value)
    VALUES (?, '실드', 0, 0)
  `).run(workspaceKey);

  return { settings, workspaceKey };
}

function getFollowSettings(workspaceKey: string) {
  const database = getDatabase();
  database.prepare("INSERT OR IGNORE INTO follow_settings (workspace_key) VALUES (?)").run(workspaceKey);
  return database.prepare("SELECT enabled, message FROM follow_settings WHERE workspace_key = ?")
    .get(workspaceKey) as { enabled: number; message: string };
}

export function getBotSettingsByKey(sessionKey: string): BotSettings {
  const { settings: row, workspaceKey } = ensureBotSettings(sessionKey);
  const follow = getFollowSettings(workspaceKey);
  return {
    djNickname: row.dj_nickname,
    greetingMessage: row.greeting_message,
    donationMessage: row.donation_message,
    heartMessage: row.heart_message,
    repeatEnabled: row.hourly_enabled === 1,
    repeatMessage: row.hourly_message,
    repeatIntervalMinutes: row.repeat_interval_minutes,
    welcomeEnabled: row.welcome_enabled === 1,
    donationEnabled: row.donation_enabled === 1,
    heartEnabled: row.heart_enabled === 1,
    followEnabled: follow.enabled === 1,
    followMessage: follow.message,
  };
}

export function getBotSettings(sessionId: string) {
  return getBotSettingsByKey(getSessionKey(sessionId));
}

export function updateBotSettings(sessionId: string, settings: BotSettings) {
  updateBotSettingsByKey(getSessionKey(sessionId), settings);
}

export function updateBotSettingsByKey(sessionKey: string, settings: BotSettings) {
  const { workspaceKey } = ensureBotSettings(sessionKey);
  getDatabase().prepare(`
    UPDATE bot_settings
    SET dj_nickname = ?, greeting_message = ?, donation_message = ?, heart_message = ?,
        hourly_enabled = ?, hourly_message = ?, repeat_interval_minutes = ?,
        welcome_enabled = ?,
        donation_enabled = ?, heart_enabled = ?
    WHERE session_key = ?
  `).run(
    settings.djNickname,
    settings.greetingMessage,
    settings.donationMessage,
    settings.heartMessage,
    settings.repeatEnabled ? 1 : 0,
    settings.repeatMessage,
    settings.repeatIntervalMinutes,
    settings.welcomeEnabled ? 1 : 0,
    settings.donationEnabled ? 1 : 0,
    settings.heartEnabled ? 1 : 0,
    workspaceKey,
  );
  getFollowSettings(workspaceKey);
  getDatabase().prepare("UPDATE follow_settings SET enabled = ?, message = ? WHERE workspace_key = ?")
    .run(settings.followEnabled ? 1 : 0, settings.followMessage, workspaceKey);
}

export function listBotCommandsByKey(sessionKey: string): BotCommand[] {
  const { workspaceKey } = ensureBotSettings(sessionKey);
  return getDatabase().prepare(
    "SELECT command, response FROM bot_commands WHERE session_key = ? ORDER BY command",
  ).all(workspaceKey) as BotCommand[];
}

export function listBotCommands(sessionId: string) {
  return listBotCommandsByKey(getSessionKey(sessionId));
}

export function upsertBotCommand(sessionId: string, command: string, response: string) {
  const { workspaceKey } = ensureBotSettings(getSessionKey(sessionId));
  getDatabase().prepare(`
    INSERT INTO bot_commands (session_key, command, response) VALUES (?, ?, ?)
    ON CONFLICT(session_key, command) DO UPDATE SET response = excluded.response
  `).run(workspaceKey, command, response);
}

export function updateBotCommand(
  sessionId: string,
  originalCommand: string,
  command: string,
  response: string,
) {
  const { workspaceKey } = ensureBotSettings(getSessionKey(sessionId));
  try {
    const result = getDatabase().prepare(`
      UPDATE bot_commands SET command = ?, response = ?
      WHERE session_key = ? AND command = ?
    `).run(command, response, workspaceKey, originalCommand);
    return result.changes > 0;
  } catch {
    return false;
  }
}

export function deleteBotCommand(sessionId: string, command: string) {
  getDatabase().prepare("DELETE FROM bot_commands WHERE session_key = ? AND command = ?")
    .run(getWorkspaceKey(getSessionKey(sessionId)), command);
}

export function findBotCommandResponse(sessionKey: string, message: string, nickname: string | null) {
  const { workspaceKey } = ensureBotSettings(sessionKey);
  const command = message.trim().toLocaleLowerCase("ko-KR");
  const row = getDatabase().prepare(
    "SELECT response FROM bot_commands WHERE session_key = ? AND command = ?",
  ).get(workspaceKey, command) as Pick<BotCommand, "response"> | undefined;
  if (!row) return null;

  const response = row.response.replaceAll("{nickname}", nickname?.trim() || "청취자");
  return response.length <= 200 ? response : response.slice(0, 200);
}

export function getAvailableCommandRepliesByKey(sessionKey: string) {
  const { workspaceKey } = ensureBotSettings(sessionKey);
  const commands = (getDatabase().prepare(`
    SELECT command FROM bot_commands
    WHERE session_key = ? AND command != '!명령어'
    ORDER BY command
  `).all(workspaceKey) as Array<{ command: string }>).map((row) => row.command);
  const counters = listBotCountersByKey(sessionKey);
  const publicLabels = [
    "!명령어",
    ...commands,
    ...counters.map((counter) => `!${counter.name}`),
    "!신청곡 곡명-가수",
    "!신청곡 목록",
    "!가위바위보 가위·바위·보",
    "!참여",
    "!팀 (번호)",
    "!출석",
    "!출석왕",
    "!정답 (답)",
    "!내 킵",
  ].filter((label, index, items) => items.indexOf(label) === index);
  const djLabels = [
    ...counters.map((counter) => `!${counter.name} +N/-N`),
    "!신청곡 삭제 번호",
    "!킵 삭제 닉네임 / 항목명 / 수량",
    "!봇 (게임 진행·자동화 켜기/끄기 안내)",
  ];

  return formatMultilineMessages(
    "사용할 수 있는 명령어:",
    "명령어 (이어서)",
    [...publicLabels, "DJ 전용:", ...djLabels],
  );
}

export function listBotCountersByKey(sessionKey: string): BotCounter[] {
  const workspaceKey = getWorkspaceKey(sessionKey);
  return (getDatabase().prepare(`
    SELECT id, name, value
    FROM bot_counters
    WHERE session_key = ?
    ORDER BY id
  `).all(workspaceKey) as Array<{
    id: number;
    name: string;
    value: number;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    value: row.value,
  }));
}

export function listBotCounters(sessionId: string) {
  return listBotCountersByKey(getSessionKey(sessionId));
}

export function saveBotCounter(
  sessionId: string,
  id: number | null,
  name: string,
  value: number,
) {
  const database = getDatabase();
  const sessionKey = getWorkspaceKey(getSessionKey(sessionId));
  try {
    if (id === null) {
      database.prepare(`
        INSERT INTO bot_counters (session_key, name, initial_value, value)
        VALUES (?, ?, ?, ?)
      `).run(sessionKey, name, value, value);
      return true;
    }

    const existing = database.prepare(
      "SELECT name FROM bot_counters WHERE id = ? AND session_key = ?",
    ).get(id, sessionKey) as Pick<BotCounter, "name"> | undefined;
    if (!existing) return false;
    const savedName = existing.name.toLocaleLowerCase("ko-KR") === "실드" ? "실드" : name;
    const result = database.prepare(`
      UPDATE bot_counters
      SET name = ?, initial_value = ?, value = ?
      WHERE id = ? AND session_key = ?
    `).run(savedName, value, value, id, sessionKey);
    return result.changes > 0;
  } catch {
    return false;
  }
}

export function deleteBotCounter(sessionId: string, id: number) {
  const result = getDatabase().prepare(
    "DELETE FROM bot_counters WHERE id = ? AND session_key = ? AND name != '실드' COLLATE NOCASE",
  ).run(id, getWorkspaceKey(getSessionKey(sessionId)));
  return result.changes > 0;
}

export function applyBotCounterCommand(sessionKey: string, message: string, isDj: boolean) {
  const command = parseCounterCommand(message, isDj);
  if (!command) return null;
  const workspaceKey = getWorkspaceKey(sessionKey);

  if (command.kind === "query") {
    const row = getDatabase().prepare(`
      SELECT name, value FROM bot_counters
      WHERE session_key = ? AND name = ? COLLATE NOCASE
    `).get(workspaceKey, command.name) as Pick<BotCounter, "name" | "value"> | undefined;
    return row ? formatCounterAdjustment(row.name, row.value) : null;
  }

  const counter = getDatabase().prepare(`
    SELECT name FROM bot_counters
    WHERE session_key = ? AND name = ? COLLATE NOCASE
  `).get(workspaceKey, command.adjustment.name) as Pick<BotCounter, "name"> | undefined;
  if (!counter) return null;
  if (command.kind === "denied") return `${counter.name} 변경은 DJ만 할 수 있어요.`;

  const row = getDatabase().prepare(`
    UPDATE bot_counters
    SET value = MIN(1000000, MAX(0, value + ?))
    WHERE session_key = ? AND name = ? COLLATE NOCASE
    RETURNING name, value
  `).get(command.adjustment.delta, workspaceKey, command.adjustment.name) as Pick<BotCounter, "name" | "value"> | undefined;
  return row ? formatCounterAdjustment(row.name, row.value) : null;
}

export function listSongRequestsByKey(sessionKey: string): SongRequest[] {
  const workspaceKey = getWorkspaceKey(sessionKey);
  return getDatabase().prepare(`
    SELECT id, requester_nickname, title, artist, created_at
    FROM song_requests
    WHERE session_key = ?
    ORDER BY id
  `).all(workspaceKey).map((row) => {
    const request = row as {
      id: number;
      requester_nickname: string;
      title: string;
      artist: string;
      created_at: number;
    };
    return {
      id: request.id,
      requesterNickname: request.requester_nickname,
      title: request.title,
      artist: request.artist,
      createdAt: request.created_at,
    };
  });
}

export function listSongRequests(sessionId: string) {
  return listSongRequestsByKey(getSessionKey(sessionId));
}

export function deleteSongRequest(sessionId: string, id: number) {
  const result = getDatabase().prepare(
    "DELETE FROM song_requests WHERE id = ? AND session_key = ?",
  ).run(id, getWorkspaceKey(getSessionKey(sessionId)));
  return result.changes > 0;
}

export function clearSongRequests(sessionId: string) {
  return getDatabase().prepare(
    "DELETE FROM song_requests WHERE session_key = ?",
  ).run(getWorkspaceKey(getSessionKey(sessionId))).changes;
}

export function applySongRequestCommand(
  sessionKey: string,
  message: string,
  isDj: boolean,
  requesterNickname: string | null,
) {
  const command = parseSongRequestCommand(message);
  if (!command) return null;
  if (command.kind === "usage") {
    return "사용법: !신청곡 곡명-가수 (예: !신청곡 밤편지-아이유)";
  }

  const database = getDatabase();
  const workspaceKey = getWorkspaceKey(sessionKey);
  if (command.kind === "list") {
    const requests = listSongRequestsByKey(sessionKey);
    if (requests.length === 0) return ["아직 신청곡이 없어요."];

    const labels = requests.map((request) => (
      `#${request.id} ${request.title}${request.artist ? ` - ${request.artist}` : ""}`
    ));
    return formatMultilineMessages("신청곡 목록:", "신청곡 (이어서)", labels);
  }
  if (command.kind === "delete") {
    if (!isDj) return "신청곡 삭제는 DJ만 할 수 있어요.";
    const result = database.prepare(
      "DELETE FROM song_requests WHERE id = ? AND session_key = ?",
    ).run(command.id, workspaceKey);
    return result.changes > 0
      ? `신청곡 ${command.id}번을 삭제했어요.`
      : `신청곡 ${command.id}번을 찾지 못했어요.`;
  }

  const row = database.prepare(`
    INSERT INTO song_requests (session_key, requester_nickname, title, artist, created_at)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id
  `).get(
    workspaceKey,
    requesterNickname?.trim().slice(0, 50) || "청취자",
    command.title,
    command.artist,
    Date.now(),
  ) as { id: number };
  return `신청곡 ${row.id}번 ${command.title} - ${command.artist} 접수 완료!`;
}
