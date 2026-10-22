import "server-only";

import { getDatabase, getSessionKey, getWorkspaceKey } from "./db";

// DJ-run listener events beyond the classic games: secret word (and, below,
// team battles and attendance).

// ---- Secret word ------------------------------------------------------------
// The DJ queues words in advance (they must never appear in chat before they
// are found). During a round the first listener whose chat message contains the
// word wins; spacing, punctuation, emoji and letter case are ignored.

export type SecretWordItem = {
  id: number;
  word: string;
  hint: string;
};

export type SecretWordRound = {
  roundId: number;
  word: string;
  hint: string;
  active: boolean;
  startedAt: number;
  endedAt: number | null;
  winnerUserId: string | null;
  winnerNickname: string | null;
  foundAt: number | null;
};

export const MAX_SECRET_WORDS = 30;

export function normalizeSecretText(text: string) {
  return text.normalize("NFC").toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]/gu, "");
}

export function isValidSecretWord(word: string, hint: string) {
  const normalized = normalizeSecretText(word);
  return normalized.length >= 1 && normalized.length <= 20 && word.trim().length <= 30 && hint.trim().length <= 100;
}

export function listSecretWordQueueByKey(sessionKey: string): SecretWordItem[] {
  return getDatabase().prepare(`
    SELECT id, word, hint FROM secret_word_queue WHERE workspace_key = ? ORDER BY created_at, id
  `).all(getWorkspaceKey(sessionKey)) as SecretWordItem[];
}

export function listSecretWordQueue(sessionId: string) {
  return listSecretWordQueueByKey(getSessionKey(sessionId));
}

export function addSecretWord(sessionId: string, word: string, hint: string) {
  if (!isValidSecretWord(word, hint)) return "invalid" as const;
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  const { count } = database.prepare("SELECT COUNT(*) AS count FROM secret_word_queue WHERE workspace_key = ?")
    .get(workspaceKey) as { count: number };
  if (count >= MAX_SECRET_WORDS) return "full" as const;
  database.prepare("INSERT INTO secret_word_queue (workspace_key, word, hint, created_at) VALUES (?, ?, ?, ?)")
    .run(workspaceKey, word.trim(), hint.trim(), Date.now());
  return "added" as const;
}

export function deleteSecretWord(sessionId: string, id: number) {
  return getDatabase().prepare("DELETE FROM secret_word_queue WHERE workspace_key = ? AND id = ?")
    .run(getWorkspaceKey(getSessionKey(sessionId)), id).changes > 0;
}

type SecretWordRoundRow = {
  round_id: number;
  word: string;
  hint: string;
  active: number;
  started_at: number;
  ended_at: number | null;
  winner_user_id: string | null;
  winner_nickname: string | null;
  found_at: number | null;
};

function mapSecretWordRound(row: SecretWordRoundRow): SecretWordRound {
  return {
    roundId: row.round_id,
    word: row.word,
    hint: row.hint,
    active: row.active === 1,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    winnerUserId: row.winner_user_id,
    winnerNickname: row.winner_nickname,
    foundAt: row.found_at,
  };
}

export function getActiveSecretWordByKey(sessionKey: string) {
  const row = getDatabase().prepare(`
    SELECT * FROM secret_word_rounds WHERE workspace_key = ? AND active = 1
  `).get(getWorkspaceKey(sessionKey)) as SecretWordRoundRow | undefined;
  return row ? mapSecretWordRound(row) : null;
}

export function listSecretWordRounds(sessionId: string, limit = 10) {
  return (getDatabase().prepare(`
    SELECT * FROM secret_word_rounds WHERE workspace_key = ? ORDER BY round_id DESC LIMIT ?
  `).all(getWorkspaceKey(getSessionKey(sessionId)), Math.max(1, Math.min(limit, 50))) as SecretWordRoundRow[])
    .map(mapSecretWordRound);
}

export function startNextSecretWordByKey(sessionKey: string, startedAt = Date.now()) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    if (database.prepare("SELECT 1 FROM secret_word_rounds WHERE workspace_key = ? AND active = 1").get(workspaceKey)) {
      database.exec("ROLLBACK");
      return { kind: "already_active" } as const;
    }
    const next = database.prepare(`
      SELECT id, word, hint FROM secret_word_queue WHERE workspace_key = ? ORDER BY created_at, id LIMIT 1
    `).get(workspaceKey) as SecretWordItem | undefined;
    if (!next) {
      database.exec("ROLLBACK");
      return { kind: "empty" } as const;
    }
    const { last } = database.prepare("SELECT COALESCE(MAX(round_id), 0) AS last FROM secret_word_rounds WHERE workspace_key = ?")
      .get(workspaceKey) as { last: number };
    database.prepare(`
      INSERT INTO secret_word_rounds (workspace_key, round_id, word, hint, active, started_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(workspaceKey, last + 1, next.word, next.hint, startedAt);
    database.prepare("DELETE FROM secret_word_queue WHERE id = ?").run(next.id);
    database.exec("COMMIT");
    return { kind: "started", length: normalizeSecretText(next.word).length } as const;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

// Checks a listener's chat message against the active word. Returns the
// finished round when this message found it, otherwise null. The UPDATE only
// succeeds once, so two simultaneous finders cannot both win.
export function applySecretWordChat(
  sessionKey: string,
  message: string,
  isDj: boolean,
  userId: string,
  nickname: string | null,
  at = Date.now(),
) {
  if (isDj) return null;
  const active = getActiveSecretWordByKey(sessionKey);
  if (!active || !normalizeSecretText(message).includes(normalizeSecretText(active.word))) return null;
  const workspaceKey = getWorkspaceKey(sessionKey);
  const won = getDatabase().prepare(`
    UPDATE secret_word_rounds
    SET active = 0, ended_at = ?, found_at = ?, winner_user_id = ?, winner_nickname = ?
    WHERE workspace_key = ? AND round_id = ? AND active = 1 AND winner_user_id IS NULL
  `).run(at, at, userId, nickname?.trim().slice(0, 50) || "청취자", workspaceKey, active.roundId).changes > 0;
  if (!won) return null;
  return { ...active, active: false, endedAt: at, foundAt: at, winnerUserId: userId, winnerNickname: nickname?.trim().slice(0, 50) || "청취자" };
}

export function finishSecretWordByKey(sessionKey: string, endedAt = Date.now()) {
  const active = getActiveSecretWordByKey(sessionKey);
  if (!active) return null;
  const ended = getDatabase().prepare(`
    UPDATE secret_word_rounds SET active = 0, ended_at = ? WHERE workspace_key = ? AND round_id = ? AND active = 1
  `).run(endedAt, getWorkspaceKey(sessionKey), active.roundId).changes > 0;
  return ended ? { ...active, active: false, endedAt } : null;
}

// ---- Team battle --------------------------------------------------------------
// Listeners pick a team once with "!팀 1" / "!팀 A팀"; their hearts and/or
// donations after joining become team points. The first team to reach the
// optional goal wins, or the DJ ends the battle.

export type TeamBattleMetric = "hearts" | "spoons" | "both";
export const TEAM_BATTLE_METRICS: TeamBattleMetric[] = ["hearts", "spoons", "both"];
export const SPOON_POINTS_IN_BOTH = 10;
const LEAD_ANNOUNCE_INTERVAL_MS = 60_000;

export type TeamBattleSettings = { teamNames: string[]; metric: TeamBattleMetric; goal: number };
export type TeamScore = { index: number; name: string; score: number; members: number };
export type TeamMemberScore = { userId: string; nickname: string; teamIndex: number; points: number };
export type TeamBattle = {
  battleId: number;
  active: boolean;
  metric: TeamBattleMetric;
  goal: number;
  startedAt: number;
  endedAt: number | null;
  winnerIndex: number | null;
  teams: TeamScore[];
  topMembers: TeamMemberScore[];
};

const DEFAULT_TEAM_SETTINGS: TeamBattleSettings = { teamNames: ["A팀", "B팀"], metric: "both", goal: 0 };

export function validateTeamBattleSettings(settings: TeamBattleSettings) {
  const names = settings.teamNames.map((name) => name.trim()).filter(Boolean);
  const normalized = names.map(normalizeSecretText);
  return names.length >= 2 && names.length <= 4
    && names.every((name) => name.length <= 10)
    && normalized.every((name) => name.length > 0)
    && new Set(normalized).size === names.length
    && TEAM_BATTLE_METRICS.includes(settings.metric)
    && Number.isSafeInteger(settings.goal) && settings.goal >= 0 && settings.goal <= 10_000_000;
}

export function getTeamBattleSettingsByKey(sessionKey: string): TeamBattleSettings {
  const row = getDatabase().prepare("SELECT team_names, metric, goal FROM team_battle_settings WHERE workspace_key = ?")
    .get(getWorkspaceKey(sessionKey)) as { team_names: string; metric: TeamBattleMetric; goal: number } | undefined;
  if (!row) return DEFAULT_TEAM_SETTINGS;
  return { teamNames: JSON.parse(row.team_names) as string[], metric: row.metric, goal: row.goal };
}

export function getTeamBattleSettings(sessionId: string) {
  return getTeamBattleSettingsByKey(getSessionKey(sessionId));
}

export function saveTeamBattleSettings(sessionId: string, settings: TeamBattleSettings) {
  const cleaned = { ...settings, teamNames: settings.teamNames.map((name) => name.trim()).filter(Boolean) };
  if (!validateTeamBattleSettings(cleaned)) return false;
  getDatabase().prepare(`
    INSERT INTO team_battle_settings (workspace_key, team_names, metric, goal) VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_key) DO UPDATE SET team_names = excluded.team_names, metric = excluded.metric, goal = excluded.goal
  `).run(getWorkspaceKey(getSessionKey(sessionId)), JSON.stringify(cleaned.teamNames), cleaned.metric, cleaned.goal);
  return true;
}

type TeamBattleRow = {
  battle_id: number;
  team_names: string;
  metric: TeamBattleMetric;
  goal: number;
  active: number;
  started_at: number;
  ended_at: number | null;
  winner_index: number | null;
  last_lead_index: number | null;
  last_lead_announced_at: number | null;
};

function loadTeamBattle(workspaceKey: string, row: TeamBattleRow): TeamBattle {
  const database = getDatabase();
  const names = JSON.parse(row.team_names) as string[];
  const totals = database.prepare(`
    SELECT team_index, COALESCE(SUM(points), 0) AS score, COUNT(*) AS members
    FROM team_members WHERE workspace_key = ? AND battle_id = ? GROUP BY team_index
  `).all(workspaceKey, row.battle_id) as Array<{ team_index: number; score: number; members: number }>;
  const teams = names.map((name, index) => {
    const total = totals.find((t) => t.team_index === index);
    return { index, name, score: total?.score ?? 0, members: total?.members ?? 0 };
  });
  const topMembers = (database.prepare(`
    SELECT user_id, nickname, team_index, points FROM team_members
    WHERE workspace_key = ? AND battle_id = ? AND points > 0
    ORDER BY points DESC, joined_at LIMIT 5
  `).all(workspaceKey, row.battle_id) as Array<{ user_id: string; nickname: string; team_index: number; points: number }>)
    .map((m) => ({ userId: m.user_id, nickname: m.nickname, teamIndex: m.team_index, points: m.points }));
  return {
    battleId: row.battle_id,
    active: row.active === 1,
    metric: row.metric,
    goal: row.goal,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    winnerIndex: row.winner_index,
    teams,
    topMembers,
  };
}

function getActiveTeamBattleRow(workspaceKey: string) {
  return getDatabase().prepare("SELECT * FROM team_battles WHERE workspace_key = ? AND active = 1")
    .get(workspaceKey) as TeamBattleRow | undefined;
}

export function getActiveTeamBattleByKey(sessionKey: string) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const row = getActiveTeamBattleRow(workspaceKey);
  return row ? loadTeamBattle(workspaceKey, row) : null;
}

export function listTeamBattles(sessionId: string, limit = 10) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  return (getDatabase().prepare("SELECT * FROM team_battles WHERE workspace_key = ? ORDER BY battle_id DESC LIMIT ?")
    .all(workspaceKey, Math.max(1, Math.min(limit, 50))) as TeamBattleRow[]).map((row) => loadTeamBattle(workspaceKey, row));
}

export function startTeamBattleByKey(sessionKey: string, startedAt = Date.now()) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  if (getActiveTeamBattleRow(workspaceKey)) return { kind: "already_active" } as const;
  const settings = getTeamBattleSettingsByKey(sessionKey);
  const { last } = database.prepare("SELECT COALESCE(MAX(battle_id), 0) AS last FROM team_battles WHERE workspace_key = ?")
    .get(workspaceKey) as { last: number };
  database.prepare(`
    INSERT INTO team_battles (workspace_key, battle_id, team_names, metric, goal, active, started_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(workspaceKey, last + 1, JSON.stringify(settings.teamNames), settings.metric, settings.goal, startedAt);
  return { kind: "started", settings } as const;
}

export function resolveTeamIndex(teamNames: string[], argument: string) {
  const text = argument.trim();
  if (/^\d+$/u.test(text)) {
    const index = Number(text) - 1;
    return index >= 0 && index < teamNames.length ? index : -1;
  }
  const wanted = normalizeSecretText(text);
  if (!wanted) return -1;
  const exact = teamNames.findIndex((name) => normalizeSecretText(name) === wanted);
  if (exact >= 0) return exact;
  const prefixed = teamNames.map((name, index) => [normalizeSecretText(name), index] as const)
    .filter(([name]) => name.startsWith(wanted));
  return prefixed.length === 1 ? prefixed[0][1] : -1;
}

// Handles "!팀 ..." from listeners. With onJoined, a successful join is
// reported through the callback (batched acknowledgement) instead of a reply.
export function applyTeamCommand(
  sessionKey: string,
  message: string,
  isDj: boolean,
  userId: string,
  nickname: string | null,
  onJoined?: (nickname: string, teamName: string) => void,
) {
  const match = /^!팀(?:\s+(.+))?$/u.exec(message.trim());
  if (!match) return null;
  const workspaceKey = getWorkspaceKey(sessionKey);
  const row = getActiveTeamBattleRow(workspaceKey);
  if (!row) return "지금 진행 중인 팀 대항전이 없어요.";
  const names = JSON.parse(row.team_names) as string[];
  const choices = names.map((name, index) => `${index + 1} ${name}`).join(" / ");
  if (isDj) return "DJ는 팀에 참여할 수 없어요.";
  const displayName = nickname?.trim().slice(0, 50) || "청취자";
  const database = getDatabase();
  const existing = database.prepare("SELECT team_index FROM team_members WHERE workspace_key = ? AND battle_id = ? AND user_id = ?")
    .get(workspaceKey, row.battle_id, userId) as { team_index: number } | undefined;
  if (existing) return `${displayName}님은 이미 ${names[existing.team_index]} 소속이에요.`;
  if (!match[1]) return `사용법: !팀 (번호) — ${choices}`;
  const teamIndex = resolveTeamIndex(names, match[1]);
  if (teamIndex < 0) return `팀을 찾지 못했어요. ${choices}`;
  database.prepare(`
    INSERT OR IGNORE INTO team_members (workspace_key, battle_id, user_id, nickname, team_index, points, joined_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(workspaceKey, row.battle_id, userId, displayName, teamIndex, Date.now());
  if (onJoined) {
    onJoined(displayName, names[teamIndex]);
    return null;
  }
  return `${displayName}님 ${names[teamIndex]} 참여 완료!`;
}

export type TeamBattleOutcome =
  | { kind: "lead_change"; battle: TeamBattle; leader: TeamScore }
  | { kind: "goal_reached"; battle: TeamBattle; winner: TeamScore };

// Adds a member's hearts or spoons to their team. Returns an announcement-worthy
// outcome (goal reached, which also ends the battle, or a lead change at most
// once a minute), otherwise null.
export function addTeamBattlePoints(
  sessionKey: string,
  userId: string,
  source: "hearts" | "spoons",
  amount: number,
  at = Date.now(),
): TeamBattleOutcome | null {
  if (!(amount > 0)) return null;
  const workspaceKey = getWorkspaceKey(sessionKey);
  const row = getActiveTeamBattleRow(workspaceKey);
  if (!row) return null;
  const points = row.metric === "both"
    ? (source === "spoons" ? amount * SPOON_POINTS_IN_BOTH : amount)
    : row.metric === source ? amount : 0;
  if (points <= 0) return null;
  const database = getDatabase();
  const updated = database.prepare(`
    UPDATE team_members SET points = points + ? WHERE workspace_key = ? AND battle_id = ? AND user_id = ?
  `).run(points, workspaceKey, row.battle_id, userId).changes > 0;
  if (!updated) return null;

  const battle = loadTeamBattle(workspaceKey, row);
  const ranked = [...battle.teams].sort((left, right) => right.score - left.score);
  if (row.goal > 0 && ranked[0].score >= row.goal) {
    database.prepare(`
      UPDATE team_battles SET active = 0, ended_at = ?, winner_index = ?
      WHERE workspace_key = ? AND battle_id = ? AND active = 1
    `).run(at, ranked[0].index, workspaceKey, row.battle_id);
    return { kind: "goal_reached", battle: { ...battle, active: false, endedAt: at, winnerIndex: ranked[0].index }, winner: ranked[0] };
  }
  const leader = ranked[0].score > ranked[1].score ? ranked[0] : null;
  if (!leader || leader.index === row.last_lead_index) return null;
  // The first leader is not news but starts the clock; later changes are
  // announced at most once a minute (flip-flops in between stay quiet).
  const wasLed = row.last_lead_index !== null;
  const announce = wasLed && at - (row.last_lead_announced_at ?? 0) >= LEAD_ANNOUNCE_INTERVAL_MS;
  database.prepare(`
    UPDATE team_battles SET last_lead_index = ?, last_lead_announced_at = CASE WHEN ? THEN ? ELSE last_lead_announced_at END
    WHERE workspace_key = ? AND battle_id = ?
  `).run(leader.index, announce || !wasLed ? 1 : 0, at, workspaceKey, row.battle_id);
  return announce ? { kind: "lead_change", battle, leader } : null;
}

export function finishTeamBattleByKey(sessionKey: string, endedAt = Date.now()) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const row = getActiveTeamBattleRow(workspaceKey);
  if (!row) return null;
  const battle = loadTeamBattle(workspaceKey, row);
  const ranked = [...battle.teams].sort((left, right) => right.score - left.score);
  const winnerIndex = ranked[0].score > ranked[1].score ? ranked[0].index : null;
  const ended = getDatabase().prepare(`
    UPDATE team_battles SET active = 0, ended_at = ?, winner_index = ? WHERE workspace_key = ? AND battle_id = ? AND active = 1
  `).run(endedAt, winnerIndex, workspaceKey, row.battle_id).changes > 0;
  return ended ? { ...battle, active: false, endedAt, winnerIndex } : null;
}
