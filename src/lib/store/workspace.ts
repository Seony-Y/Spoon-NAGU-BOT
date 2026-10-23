import "server-only";

import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import { getDatabase, getSessionKey, getWorkspaceKey } from "./db";
import { ensureBotSettings } from "./settings";

export type WorkspaceBackupValue = string | number | null;

export type WorkspaceBackupData = {
  tables: Record<string, Array<Record<string, WorkspaceBackupValue>>>;
};

const CORE_BACKUP_TABLES = [
  { name: "bot_settings", key: "session_key", columns: ["dj_nickname", "greeting_message", "donation_message", "heart_message", "hourly_enabled", "hourly_message", "repeat_interval_minutes", "commands_enabled", "welcome_enabled", "donation_enabled", "heart_enabled", "commands_initialized"] },
  { name: "bot_commands", key: "session_key", columns: ["command", "response"] },
  { name: "bot_counters", key: "session_key", columns: ["name", "initial_value", "value"] },
  { name: "song_requests", key: "session_key", columns: ["requester_nickname", "title", "artist", "created_at"] },
  { name: "rps_rounds", key: "workspace_key", columns: ["round_id", "dj_choice", "active", "started_at", "ended_at"] },
  { name: "rps_entries", key: "workspace_key", columns: ["round_id", "user_id", "nickname", "choice", "result", "created_at"] },
  { name: "raffle_rounds", key: "workspace_key", columns: ["round_id", "winner_count", "active", "started_at", "ended_at"] },
  { name: "raffle_entries", key: "workspace_key", columns: ["round_id", "user_id", "nickname", "winner", "created_at"] },
  { name: "quiz_rounds", key: "workspace_key", columns: ["round_id", "question", "answer", "answer_normalized", "active", "started_at", "ended_at", "winner_user_id", "winner_nickname", "elapsed_ms"] },
  { name: "quiz_submissions", key: "workspace_key", columns: ["round_id", "user_id", "nickname", "answer", "answer_normalized", "submitted_at", "correct", "correct_at"] },
  { name: "quiz_queue", key: "workspace_key", columns: ["question", "answer", "created_at"] },
  { name: "follow_settings", key: "workspace_key", columns: ["enabled", "message"] },
  { name: "secret_word_queue", key: "workspace_key", columns: ["word", "hint", "created_at"] },
  { name: "team_battle_settings", key: "workspace_key", columns: ["team_names", "metric", "goal"] },
  { name: "broadcasts", key: "workspace_key", columns: ["live_id", "started_at"] },
  { name: "attendance_settings", key: "workspace_key", columns: ["announce"] },
  { name: "team_battles", key: "workspace_key", columns: ["battle_id", "team_names", "metric", "goal", "active", "started_at", "ended_at", "winner_index", "last_lead_index", "last_lead_announced_at"] },
  { name: "team_members", key: "workspace_key", columns: ["battle_id", "user_id", "nickname", "team_index", "points", "joined_at"] },
  { name: "secret_word_rounds", key: "workspace_key", columns: ["round_id", "word", "hint", "active", "started_at", "ended_at", "winner_user_id", "winner_nickname", "found_at"] },
  { name: "roulette_settings", key: "workspace_key", columns: ["enabled", "cost", "miss_weight"] },
  { name: "roulette_items", key: "workspace_key", columns: ["label", "weight", "created_at"] },
  { name: "roulette_results", key: "workspace_key", columns: ["live_id", "event_id", "user_id", "nickname", "item_label", "is_miss", "spoons", "created_at"] },
  { name: "roulette_keeps", key: "workspace_key", columns: ["user_id", "nickname", "item_label", "count", "updated_at"] },
] as const;

const AUDIENCE_BACKUP_TABLES = [
  { name: "audience_profiles", key: "workspace_key", columns: ["user_id", "nickname", "first_seen_at", "last_seen_at"] },
  { name: "audience_events", key: "workspace_key", columns: ["event_id", "event_type", "live_id", "user_id", "spoons", "hearts", "favorite_temperature", "occurred_at", "stat_date"] },
  { name: "audience_spoon_snapshots", key: "workspace_key", columns: ["live_id", "user_id", "spoons", "stat_date", "updated_at"] },
  { name: "audience_archive", key: "workspace_key", columns: ["user_id", "spoons", "hearts", "favorite_temperature"] },
  { name: "attendance", key: "workspace_key", columns: ["user_id", "live_id", "nickname", "attended_at", "month"] },
] as const;

export const WORKSPACE_BACKUP_TABLES = {
  core: CORE_BACKUP_TABLES,
  audience: AUDIENCE_BACKUP_TABLES,
} as const;

function mergeWorkspaceData(database: DatabaseSync, sourceKey: string, targetKey: string) {
  if (sourceKey === targetKey) return;

  database.prepare(`
    INSERT OR IGNORE INTO bot_commands (session_key, command, response)
    SELECT ?, command, response FROM bot_commands WHERE session_key = ?
  `).run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO bot_counters (session_key, name, initial_value, value)
    SELECT ?, name, initial_value, value FROM bot_counters WHERE session_key = ?
  `).run(targetKey, sourceKey);
  database.prepare("UPDATE song_requests SET session_key = ? WHERE session_key = ?")
    .run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO audience_events (
      workspace_key, event_id, event_type, live_id, user_id,
      spoons, hearts, favorite_temperature, occurred_at, stat_date
    )
    SELECT ?, event_id, event_type, live_id, user_id,
           spoons, hearts, favorite_temperature, occurred_at, stat_date
    FROM audience_events WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  database.prepare(`
    INSERT INTO audience_spoon_snapshots (
      workspace_key, live_id, user_id, spoons, stat_date, updated_at
    )
    SELECT ?, live_id, user_id, spoons, stat_date, updated_at
    FROM audience_spoon_snapshots WHERE workspace_key = ?
    ON CONFLICT(workspace_key, live_id, user_id) DO UPDATE SET
      spoons = MAX(audience_spoon_snapshots.spoons, excluded.spoons),
      updated_at = MAX(audience_spoon_snapshots.updated_at, excluded.updated_at)
  `).run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO recent_bot_events (
      workspace_key, event_id, event_type, data_json, received_at
    )
    SELECT ?, event_id, event_type, data_json, received_at
    FROM recent_bot_events WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  const sourceRpsRounds = database.prepare(`
    SELECT round_id, dj_choice, active, started_at, ended_at
    FROM rps_rounds WHERE workspace_key = ? ORDER BY round_id
  `).all(sourceKey) as Array<{
    round_id: number;
    dj_choice: string;
    active: number;
    started_at: number;
    ended_at: number | null;
  }>;
  const targetRpsState = database.prepare(`
    SELECT COALESCE(MAX(round_id), 0) AS max_round_id, MAX(active) AS has_active
    FROM rps_rounds WHERE workspace_key = ?
  `).get(targetKey) as { max_round_id: number; has_active: number | null };
  let nextRoundId = targetRpsState.max_round_id;
  let targetHasActiveRound = targetRpsState.has_active === 1;
  for (const sourceRpsRound of sourceRpsRounds) {
    nextRoundId += 1;
    const active = sourceRpsRound.active === 1 && !targetHasActiveRound ? 1 : 0;
    if (active === 1) targetHasActiveRound = true;
    database.prepare(`
      INSERT INTO rps_rounds (
        workspace_key, round_id, dj_choice, active, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      targetKey,
      nextRoundId,
      sourceRpsRound.dj_choice,
      active,
      sourceRpsRound.started_at,
      active === 1 ? null : (sourceRpsRound.ended_at ?? Date.now()),
    );
    database.prepare(`
      INSERT OR IGNORE INTO rps_entries (
        workspace_key, round_id, user_id, nickname, choice, result, created_at
      )
      SELECT ?, ?, user_id, nickname, choice, result, created_at
      FROM rps_entries WHERE workspace_key = ? AND round_id = ?
    `).run(targetKey, nextRoundId, sourceKey, sourceRpsRound.round_id);
  }

  const sourceRaffleRounds = database.prepare(`
    SELECT round_id, winner_count, active, started_at, ended_at
    FROM raffle_rounds WHERE workspace_key = ? ORDER BY round_id
  `).all(sourceKey) as Array<{
    round_id: number;
    winner_count: number;
    active: number;
    started_at: number;
    ended_at: number | null;
  }>;
  const targetRaffleState = database.prepare(`
    SELECT COALESCE(MAX(round_id), 0) AS max_round_id, MAX(active) AS has_active
    FROM raffle_rounds WHERE workspace_key = ?
  `).get(targetKey) as { max_round_id: number; has_active: number | null };
  let nextRaffleRoundId = targetRaffleState.max_round_id;
  let targetHasActiveRaffle = targetRaffleState.has_active === 1;
  for (const sourceRound of sourceRaffleRounds) {
    nextRaffleRoundId += 1;
    const active = sourceRound.active === 1 && !targetHasActiveRaffle ? 1 : 0;
    if (active === 1) targetHasActiveRaffle = true;
    database.prepare(`
      INSERT INTO raffle_rounds (
        workspace_key, round_id, winner_count, active, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      targetKey,
      nextRaffleRoundId,
      sourceRound.winner_count,
      active,
      sourceRound.started_at,
      active === 1 ? null : (sourceRound.ended_at ?? Date.now()),
    );
    database.prepare(`
      INSERT OR IGNORE INTO raffle_entries (
        workspace_key, round_id, user_id, nickname, winner, created_at
      )
      SELECT ?, ?, user_id, nickname, winner, created_at
      FROM raffle_entries WHERE workspace_key = ? AND round_id = ?
    `).run(targetKey, nextRaffleRoundId, sourceKey, sourceRound.round_id);
  }

  const sourceQuizRounds = database.prepare(`
    SELECT round_id, question, answer, answer_normalized, active, started_at, ended_at,
           winner_user_id, winner_nickname, elapsed_ms
    FROM quiz_rounds WHERE workspace_key = ? ORDER BY round_id
  `).all(sourceKey) as Array<{
    round_id: number;
    question: string;
    answer: string;
    answer_normalized: string;
    active: number;
    started_at: number;
    ended_at: number | null;
    winner_user_id: string | null;
    winner_nickname: string | null;
    elapsed_ms: number | null;
  }>;
  const targetQuizState = database.prepare(`
    SELECT COALESCE(MAX(round_id), 0) AS max_round_id, MAX(active) AS has_active
    FROM quiz_rounds WHERE workspace_key = ?
  `).get(targetKey) as { max_round_id: number; has_active: number | null };
  let nextQuizRoundId = targetQuizState.max_round_id;
  let targetHasActiveQuiz = targetQuizState.has_active === 1;
  for (const sourceRound of sourceQuizRounds) {
    nextQuizRoundId += 1;
    const active = sourceRound.active === 1 && !targetHasActiveQuiz ? 1 : 0;
    if (active === 1) targetHasActiveQuiz = true;
    database.prepare(`
      INSERT INTO quiz_rounds (
        workspace_key, round_id, question, answer, answer_normalized, active,
        started_at, ended_at, winner_user_id, winner_nickname, elapsed_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetKey,
      nextQuizRoundId,
      sourceRound.question,
      sourceRound.answer,
      sourceRound.answer_normalized,
      active,
      sourceRound.started_at,
      active === 1 ? null : (sourceRound.ended_at ?? Date.now()),
      sourceRound.winner_user_id,
      sourceRound.winner_nickname,
      sourceRound.elapsed_ms,
    );
    database.prepare(`
      INSERT OR IGNORE INTO quiz_submissions (
        workspace_key, round_id, user_id, nickname, answer, answer_normalized,
        submitted_at, correct, correct_at
      )
      SELECT ?, ?, user_id, nickname, answer, answer_normalized,
             submitted_at, correct, correct_at
      FROM quiz_submissions WHERE workspace_key = ? AND round_id = ?
    `).run(targetKey, nextQuizRoundId, sourceKey, sourceRound.round_id);
  }

  database.prepare(`
    INSERT OR IGNORE INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
    SELECT ?, enabled, cost, miss_weight FROM roulette_settings WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO roulette_items (workspace_key, label, weight, created_at)
    SELECT ?, label, weight, created_at FROM roulette_items WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO roulette_results (
      workspace_key, live_id, event_id, user_id, nickname,
      item_label, is_miss, spoons, created_at
    )
    SELECT ?, live_id, event_id, user_id, nickname,
           item_label, is_miss, spoons, created_at
    FROM roulette_results WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  const sourceRouletteKeeps = database.prepare(`
    SELECT user_id, nickname, item_label, count, updated_at
    FROM roulette_keeps WHERE workspace_key = ?
  `).all(sourceKey) as Array<{
    user_id: string;
    nickname: string;
    item_label: string;
    count: number;
    updated_at: number;
  }>;
  const mergeRouletteKeep = database.prepare(`
    INSERT INTO roulette_keeps (
      workspace_key, user_id, nickname, item_label, count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_key, user_id, item_label) DO UPDATE SET
      nickname = excluded.nickname,
      count = roulette_keeps.count + excluded.count,
      updated_at = MAX(roulette_keeps.updated_at, excluded.updated_at)
  `);
  for (const keep of sourceRouletteKeeps) {
    mergeRouletteKeep.run(
      targetKey,
      keep.user_id,
      keep.nickname,
      keep.item_label,
      keep.count,
      keep.updated_at,
    );
  }

  const profiles = database.prepare(`
    SELECT user_id, nickname, first_seen_at, last_seen_at
    FROM audience_profiles WHERE workspace_key = ?
  `).all(sourceKey) as Array<{
    user_id: string;
    nickname: string | null;
    first_seen_at: number;
    last_seen_at: number;
  }>;
  const mergeProfile = database.prepare(`
    INSERT INTO audience_profiles (workspace_key, user_id, nickname, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_key, user_id) DO UPDATE SET
      nickname = CASE
        WHEN excluded.last_seen_at >= audience_profiles.last_seen_at
        THEN COALESCE(excluded.nickname, audience_profiles.nickname)
        ELSE audience_profiles.nickname
      END,
      first_seen_at = MIN(audience_profiles.first_seen_at, excluded.first_seen_at),
      last_seen_at = MAX(audience_profiles.last_seen_at, excluded.last_seen_at)
  `);
  for (const profile of profiles) {
    mergeProfile.run(
      targetKey,
      profile.user_id,
      profile.nickname,
      profile.first_seen_at,
      profile.last_seen_at,
    );
  }
  database.prepare("UPDATE quiz_queue SET workspace_key = ? WHERE workspace_key = ?")
    .run(targetKey, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO follow_settings (workspace_key, enabled, message)
    SELECT ?, enabled, message FROM follow_settings WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  database.prepare("DELETE FROM follow_settings WHERE workspace_key = ?").run(sourceKey);
  database.prepare("UPDATE secret_word_queue SET workspace_key = ? WHERE workspace_key = ?").run(targetKey, sourceKey);
  // Merged rounds are renumbered after the target's and never left active.
  database.prepare(`
    INSERT INTO secret_word_rounds (workspace_key, round_id, word, hint, active, started_at, ended_at, winner_user_id, winner_nickname, found_at)
    SELECT ?, round_id + (SELECT COALESCE(MAX(round_id), 0) FROM secret_word_rounds WHERE workspace_key = ?),
           word, hint, 0, started_at, COALESCE(ended_at, started_at), winner_user_id, winner_nickname, found_at
    FROM secret_word_rounds WHERE workspace_key = ?
  `).run(targetKey, targetKey, sourceKey);
  database.prepare("DELETE FROM secret_word_rounds WHERE workspace_key = ?").run(sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO team_battle_settings (workspace_key, team_names, metric, goal)
    SELECT ?, team_names, metric, goal FROM team_battle_settings WHERE workspace_key = ?
  `).run(targetKey, sourceKey);
  database.prepare("DELETE FROM team_battle_settings WHERE workspace_key = ?").run(sourceKey);
  const battleOffset = (database.prepare("SELECT COALESCE(MAX(battle_id), 0) AS last FROM team_battles WHERE workspace_key = ?")
    .get(targetKey) as { last: number }).last;
  database.prepare(`
    INSERT INTO team_battles (workspace_key, battle_id, team_names, metric, goal, active, started_at, ended_at, winner_index, last_lead_index, last_lead_announced_at)
    SELECT ?, battle_id + ?, team_names, metric, goal, 0, started_at, COALESCE(ended_at, started_at), winner_index, last_lead_index, last_lead_announced_at
    FROM team_battles WHERE workspace_key = ?
  `).run(targetKey, battleOffset, sourceKey);
  database.prepare(`
    INSERT OR IGNORE INTO team_members (workspace_key, battle_id, user_id, nickname, team_index, points, joined_at)
    SELECT ?, battle_id + ?, user_id, nickname, team_index, points, joined_at FROM team_members WHERE workspace_key = ?
  `).run(targetKey, battleOffset, sourceKey);
  database.prepare("DELETE FROM team_members WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM team_battles WHERE workspace_key = ?").run(sourceKey);
  for (const [table, columns] of [
    ["broadcasts", "live_id, started_at"],
    ["attendance", "user_id, live_id, nickname, attended_at, month, checked_in"],
    ["attendance_settings", "announce"],
  ]) {
    database.prepare(`INSERT OR IGNORE INTO ${table} (workspace_key, ${columns}) SELECT ?, ${columns} FROM ${table} WHERE workspace_key = ?`)
      .run(targetKey, sourceKey);
    database.prepare(`DELETE FROM ${table} WHERE workspace_key = ?`).run(sourceKey);
  }

  database.prepare("DELETE FROM bot_commands WHERE session_key = ?").run(sourceKey);
  database.prepare("DELETE FROM bot_counters WHERE session_key = ?").run(sourceKey);
  database.prepare("DELETE FROM bot_settings WHERE session_key = ?").run(sourceKey);
  database.prepare("DELETE FROM audience_events WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM audience_spoon_snapshots WHERE workspace_key = ?").run(sourceKey);
  database.prepare(`
    INSERT INTO audience_archive (workspace_key, user_id, spoons, hearts, favorite_temperature)
    SELECT ?, user_id, spoons, hearts, favorite_temperature FROM audience_archive WHERE workspace_key = ?
    ON CONFLICT(workspace_key, user_id) DO UPDATE SET
      spoons = audience_archive.spoons + excluded.spoons,
      hearts = audience_archive.hearts + excluded.hearts
  `).run(targetKey, sourceKey);
  database.prepare("DELETE FROM audience_archive WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM recent_bot_events WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM audience_profiles WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM rps_entries WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM rps_rounds WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM raffle_entries WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM raffle_rounds WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM quiz_submissions WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM quiz_rounds WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM roulette_keeps WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM roulette_results WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM roulette_items WHERE workspace_key = ?").run(sourceKey);
  database.prepare("DELETE FROM roulette_settings WHERE workspace_key = ?").run(sourceKey);
}

// Links a session to the DJ's saved data. Called at login with the id from
// GET /v1/me (nickname unknown, null) and on DJ chat events as a fallback when
// the app has no me.read scope.
export function linkDjWorkspaceByKey(sessionKey: string, djUserId: string, nickname: string | null) {
  const normalized = nickname?.trim().slice(0, 50) ?? "";
  const normalizedUserId = djUserId.trim();
  if (!normalizedUserId) return;
  const database = getDatabase();
  // A DJ blocked by an admin stays blocked on every new session.
  if (database.prepare("SELECT 1 FROM blocked_djs WHERE dj_user_id = ?").get(normalizedUserId)) {
    database.prepare("UPDATE oauth_sessions SET blocked = 1, bot_enabled = 0, updated_at = ? WHERE id_hash = ?")
      .run(Date.now(), sessionKey);
  }
  const currentWorkspaceKey = getWorkspaceKey(sessionKey);
  const owner = getWorkspaceOwner(currentWorkspaceKey);
  if (owner === normalizedUserId) {
    // Already linked (the common case on every DJ chat): only fill in a blank
    // display name, so a name the DJ typed in the dashboard is never replaced.
    if (normalized) {
      database.prepare("UPDATE bot_settings SET dj_nickname = ? WHERE session_key = ? AND dj_nickname = ''")
        .run(normalized, currentWorkspaceKey);
    }
    return;
  }
  // One transaction: a merge that fails halfway must not leave copied rows
  // behind, or the next DJ chat would merge (and duplicate history) again.
  database.exec("BEGIN IMMEDIATE");
  try {
    const existing = database.prepare(
      "SELECT workspace_key FROM dj_workspaces WHERE dj_user_id = ?",
    ).get(normalizedUserId) as { workspace_key: string } | undefined;
    // A workspace already owned by another DJ (e.g. two DJs taking turns in one
    // browser) must never be merged into this DJ's data or handed over.
    const workspaceKey = existing?.workspace_key
      ?? (owner ? randomBytes(32).toString("hex") : currentWorkspaceKey);
    if (!owner) mergeWorkspaceData(database, currentWorkspaceKey, workspaceKey);
    const now = Date.now();
    database.prepare(`
      INSERT INTO dj_workspaces (dj_user_id, workspace_key, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(dj_user_id) DO UPDATE SET updated_at = excluded.updated_at
    `).run(normalizedUserId, workspaceKey, now, now);
    database.prepare("UPDATE oauth_sessions SET workspace_key = ?, dj_user_id = ? WHERE id_hash = ?")
      .run(workspaceKey, normalizedUserId, sessionKey);
    ensureBotSettings(sessionKey);
    if (normalized) {
      database.prepare("UPDATE bot_settings SET dj_nickname = ? WHERE session_key = ? AND dj_nickname = ''")
        .run(normalized, workspaceKey);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function getWorkspaceOwner(workspaceKey: string) {
  const row = getDatabase().prepare("SELECT dj_user_id FROM dj_workspaces WHERE workspace_key = ?")
    .get(workspaceKey) as { dj_user_id: string } | undefined;
  return row?.dj_user_id ?? null;
}

// False until the DJ's identity is known (via /v1/me at login, or the first
// DJ chat without me.read); the dashboard explains this state.
export function isWorkspaceLinkedByKey(sessionKey: string) {
  return getWorkspaceOwner(getWorkspaceKey(sessionKey)) !== null;
}

// A browser's existing session may belong to another DJ who used the same
// browser before; such a session must not be reused for this DJ's login.
export function sessionBelongsToOtherDj(sessionKey: string, djUserId: string) {
  const owner = getWorkspaceOwner(getWorkspaceKey(sessionKey));
  return owner !== null && owner !== djUserId;
}

export function exportWorkspaceData(sessionId: string, includeAudience: boolean): WorkspaceBackupData {
  const sessionKey = getSessionKey(sessionId);
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  const specifications = includeAudience
    ? [...CORE_BACKUP_TABLES, ...AUDIENCE_BACKUP_TABLES]
    : [...CORE_BACKUP_TABLES];
  const tables: WorkspaceBackupData["tables"] = {};
  for (const specification of specifications) {
    tables[specification.name] = database.prepare(`
      SELECT ${specification.columns.join(", ")}
      FROM ${specification.name}
      WHERE ${specification.key} = ?
    `).all(workspaceKey) as Array<Record<string, WorkspaceBackupValue>>;
  }
  return { tables };
}

// Deletes every backed-up table of the workspace (settings return to their
// defaults). Login, bot state, and the DJ link are not workspace data.
export function resetWorkspaceData(sessionId: string) {
  const tables = Object.fromEntries([...CORE_BACKUP_TABLES, ...AUDIENCE_BACKUP_TABLES].map((specification) => [specification.name, []]));
  return restoreWorkspaceData(sessionId, { tables });
}

export function restoreWorkspaceData(sessionId: string, backup: WorkspaceBackupData) {
  const sessionKey = getSessionKey(sessionId);
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  const includedSpecifications = [...CORE_BACKUP_TABLES, ...AUDIENCE_BACKUP_TABLES]
    .filter((specification) => Object.hasOwn(backup.tables, specification.name));

  database.exec("BEGIN IMMEDIATE");
  try {
    // checked_in (whether `!출석` was answered this broadcast) is not in backups;
    // keep it for rows the restore brings back so "출석 완료!" is not repeated.
    const checkedIn = Object.hasOwn(backup.tables, "attendance")
      ? database.prepare("SELECT user_id, live_id FROM attendance WHERE workspace_key = ? AND checked_in = 1").all(workspaceKey) as Array<{ user_id: string; live_id: number }>
      : [];
    for (const specification of [...includedSpecifications].reverse()) {
      database.prepare(`DELETE FROM ${specification.name} WHERE ${specification.key} = ?`)
        .run(workspaceKey);
    }
    for (const specification of includedSpecifications) {
      const columns = [specification.key, ...specification.columns];
      const placeholders = columns.map(() => "?").join(", ");
      const insert = database.prepare(`
        INSERT INTO ${specification.name} (${columns.join(", ")})
        VALUES (${placeholders})
      `);
      for (const row of backup.tables[specification.name]) {
        insert.run(workspaceKey, ...specification.columns.map((column) => row[column]));
      }
    }
    const markCheckedIn = database.prepare("UPDATE attendance SET checked_in = 1 WHERE workspace_key = ? AND user_id = ? AND live_id = ?");
    for (const row of checkedIn) markCheckedIn.run(workspaceKey, row.user_id, row.live_id);
    database.exec("COMMIT");
  } catch {
    database.exec("ROLLBACK");
    return false;
  }
  ensureBotSettings(sessionKey);
  return true;
}
