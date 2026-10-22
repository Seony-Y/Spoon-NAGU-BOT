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
