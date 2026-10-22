import "server-only";

import { createHash } from "node:crypto";

import { type SpoonFan } from "../spoon";
import { type ParsedSseEvent } from "../spoon-events";
import { getDatabase, getSessionKey, getWorkspaceKey } from "./db";

export type AudienceRankingPeriod = "current" | "daily" | "all";

export type AudienceRankingEntry = {
  userId: string;
  nickname: string;
  spoons: number;
  hearts: number;
  favoriteTemperature: number | null;
};

export type PersistedBotEvent = {
  id?: string;
  type: Exclude<ParsedSseEvent["event"], "end">;
  data: Exclude<ParsedSseEvent, { event: "end" }>["data"];
  receivedAt: string;
};

function getEventTime(event: Exclude<ParsedSseEvent, { event: "end" }>) {
  const value = event.event === "chat" ? event.data.sentTime : event.data.time;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
}

function getKoreanDate(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function recordAudienceEvent(
  sessionKey: string,
  liveId: number,
  event: ParsedSseEvent,
) {
  if (event.event === "end" || event.event === "chat") return false;
  const workspaceKey = getWorkspaceKey(sessionKey);
  const occurredAt = getEventTime(event);
  const eventId = event.id || createHash("sha256")
    .update(`${event.event}:${JSON.stringify(event.data)}`)
    .digest("hex");
  const spoons = event.event === "donation" ? event.data.amount : 0;
  // Spoon identifies a donation by donor and time (the donations API has no
  // event id), so a donation recovered from the API and the same donation from
  // the stream must count once whichever arrives first.
  if (event.event === "donation") {
    const existing = getDatabase().prepare(`
      SELECT 1 FROM audience_events
      WHERE workspace_key = ? AND event_type = 'donation' AND user_id = ? AND occurred_at = ?
    `).get(workspaceKey, event.data.user.id, occurredAt);
    if (existing) return false;
  }
  const hearts = event.event === "like" ? event.data.totalAmount : 0;
  const favoriteTemperature = event.event === "presence" ? event.data.favoriteTemperature : null;
  const database = getDatabase();
  const inserted = database.prepare(`
    INSERT OR IGNORE INTO audience_events (
      workspace_key, event_id, event_type, live_id, user_id,
      spoons, hearts, favorite_temperature, occurred_at, stat_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    workspaceKey,
    eventId,
    event.event,
    liveId,
    event.data.user.id,
    spoons,
    hearts,
    favoriteTemperature,
    occurredAt,
    getKoreanDate(occurredAt),
  );
  if (inserted.changes === 0) return false;

  database.prepare(`
    INSERT INTO audience_profiles (workspace_key, user_id, nickname, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_key, user_id) DO UPDATE SET
      nickname = COALESCE(excluded.nickname, audience_profiles.nickname),
      last_seen_at = MAX(audience_profiles.last_seen_at, excluded.last_seen_at)
  `).run(
    workspaceKey,
    event.data.user.id,
    event.data.user.nickname,
    occurredAt,
    occurredAt,
  );
  return true;
}

export function getLiveAutomationStateByKey(sessionKey: string, liveId: number) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  const totals = database.prepare(`
    SELECT
      COALESCE(SUM(hearts), 0) AS hearts,
      COALESCE(SUM(spoons), 0) AS spoons,
      COUNT(DISTINCT CASE WHEN event_type = 'presence' THEN user_id END) AS welcomed_listeners
    FROM audience_events
    WHERE workspace_key = ? AND live_id = ?
  `).get(workspaceKey, liveId) as {
    hearts: number;
    spoons: number;
    welcomed_listeners: number;
  };
  const greetedUserIds = database.prepare(`
    SELECT DISTINCT user_id
    FROM audience_events
    WHERE workspace_key = ? AND live_id = ? AND event_type = 'presence'
  `).all(workspaceKey, liveId) as Array<{ user_id: string }>;
  return {
    activity: {
      hearts: totals.hearts,
      spoons: totals.spoons,
      welcomedListeners: totals.welcomed_listeners,
    },
    greetedUserIds: greetedUserIds.map((row) => row.user_id),
  };
}

export function syncLiveFanSpoonRanking(
  sessionKey: string,
  liveId: number,
  fans: SpoonFan[],
) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  const now = Date.now();
  const statDate = getKoreanDate(now);
  const upsertSnapshot = database.prepare(`
    INSERT INTO audience_spoon_snapshots (
      workspace_key, live_id, user_id, spoons, stat_date, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_key, live_id, user_id) DO UPDATE SET
      spoons = MAX(audience_spoon_snapshots.spoons, excluded.spoons),
      stat_date = excluded.stat_date,
      updated_at = excluded.updated_at
  `);
  const upsertProfile = database.prepare(`
    INSERT INTO audience_profiles (workspace_key, user_id, nickname, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_key, user_id) DO UPDATE SET
      nickname = COALESCE(excluded.nickname, audience_profiles.nickname),
      last_seen_at = MAX(audience_profiles.last_seen_at, excluded.last_seen_at)
  `);

  database.exec("BEGIN IMMEDIATE");
  try {
    for (const fan of fans) {
      if (fan.spoonCount === null || fan.spoonCount <= 0) continue;
      upsertSnapshot.run(workspaceKey, liveId, fan.id, fan.spoonCount, statDate, now);
      upsertProfile.run(workspaceKey, fan.id, fan.nickname, now, now);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function recordRecentBotEventByKey(
  sessionKey: string,
  event: Exclude<ParsedSseEvent, { event: "end" }>,
  receivedAt: string,
) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const timestamp = Date.parse(receivedAt);
  const eventId = event.id || createHash("sha256")
    .update(`recent:${event.event}:${JSON.stringify(event.data)}:${receivedAt}`)
    .digest("hex");
  const database = getDatabase();
  database.prepare(`
    INSERT OR IGNORE INTO recent_bot_events (
      workspace_key, event_id, event_type, data_json, received_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    workspaceKey,
    eventId,
    event.event,
    JSON.stringify(event.data),
    Number.isNaN(timestamp) ? Date.now() : timestamp,
  );
  database.prepare(`
    DELETE FROM recent_bot_events
    WHERE workspace_key = ? AND event_id NOT IN (
      SELECT event_id FROM recent_bot_events
      WHERE workspace_key = ?
      ORDER BY received_at DESC LIMIT 50
    )
  `).run(workspaceKey, workspaceKey);
}

export function listRecentBotEventsByKey(sessionKey: string): PersistedBotEvent[] {
  const rows = getDatabase().prepare(`
    SELECT event_id, event_type, data_json, received_at
    FROM recent_bot_events
    WHERE workspace_key = ?
    ORDER BY received_at DESC LIMIT 50
  `).all(getWorkspaceKey(sessionKey)) as Array<{
    event_id: string;
    event_type: PersistedBotEvent["type"];
    data_json: string;
    received_at: number;
  }>;
  return rows.flatMap((row) => {
    try {
      return [{
        id: row.event_id,
        type: row.event_type,
        data: JSON.parse(row.data_json) as PersistedBotEvent["data"],
        receivedAt: new Date(row.received_at).toISOString(),
      }];
    } catch {
      return [];
    }
  });
}

export function clearRecentBotEventsByKey(sessionKey: string) {
  getDatabase().prepare(`
    DELETE FROM recent_bot_events
    WHERE workspace_key = ?
  `).run(getWorkspaceKey(sessionKey));
}

export function listAudienceRankingsByKey(
  sessionKey: string,
  period: AudienceRankingPeriod,
  liveId?: number,
): AudienceRankingEntry[] {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const conditions = ["e.workspace_key = ?"];
  const parameters: Array<string | number> = [workspaceKey];
  if (period === "current") {
    if (liveId === undefined) return [];
    conditions.push("e.live_id = ?");
    parameters.push(liveId);
  } else if (period === "daily") {
    conditions.push("e.stat_date = ?");
    parameters.push(getKoreanDate(Date.now()));
  }

  const database = getDatabase();
  const entries = (database.prepare(`
    SELECT e.user_id, COALESCE(p.nickname, '청취자') AS nickname,
           SUM(e.spoons) AS spoons, SUM(e.hearts) AS hearts,
           MAX(e.favorite_temperature) AS favorite_temperature
    FROM audience_events e
    LEFT JOIN audience_profiles p
      ON p.workspace_key = e.workspace_key AND p.user_id = e.user_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY e.user_id, p.nickname
  `).all(...parameters).map((row) => {
    const entry = row as {
      user_id: string;
      nickname: string;
      spoons: number;
      hearts: number;
      favorite_temperature: number | null;
    };
    return {
      userId: entry.user_id,
      nickname: entry.nickname,
      spoons: entry.spoons,
      hearts: entry.hearts,
      favoriteTemperature: entry.favorite_temperature,
    };
  })) as AudienceRankingEntry[];
  const entryMap = new Map(entries.map((entry) => [entry.userId, entry]));
  const snapshotConditions = ["s.workspace_key = ?"];
  const snapshotParameters: Array<string | number> = [workspaceKey];
  if (period === "current") {
    snapshotConditions.push("s.live_id = ?");
    snapshotParameters.push(liveId as number);
  } else if (period === "daily") {
    snapshotConditions.push("s.stat_date = ?");
    snapshotParameters.push(getKoreanDate(Date.now()));
  }
  const effectiveSpoons = database.prepare(`
    WITH event_spoons AS (
      SELECT e.live_id, e.user_id, SUM(e.spoons) AS spoons
      FROM audience_events e
      WHERE ${conditions.join(" AND ")}
      GROUP BY e.live_id, e.user_id
    ), snapshot_spoons AS (
      SELECT s.live_id, s.user_id, MAX(s.spoons) AS spoons
      FROM audience_spoon_snapshots s
      WHERE ${snapshotConditions.join(" AND ")}
      GROUP BY s.live_id, s.user_id
    ), spoon_keys AS (
      SELECT live_id, user_id FROM event_spoons
      UNION
      SELECT live_id, user_id FROM snapshot_spoons
    )
    SELECT k.user_id, COALESCE(p.nickname, '청취자') AS nickname,
           SUM(MAX(COALESCE(e.spoons, 0), COALESCE(s.spoons, 0))) AS spoons
    FROM spoon_keys k
    LEFT JOIN event_spoons e ON e.live_id = k.live_id AND e.user_id = k.user_id
    LEFT JOIN snapshot_spoons s ON s.live_id = k.live_id AND s.user_id = k.user_id
    LEFT JOIN audience_profiles p
      ON p.workspace_key = ? AND p.user_id = k.user_id
    GROUP BY k.user_id, p.nickname
  `).all(...parameters, ...snapshotParameters, workspaceKey) as Array<{
    user_id: string;
    nickname: string;
    spoons: number;
  }>;
  for (const row of effectiveSpoons) {
    const entry = entryMap.get(row.user_id);
    if (entry) {
      entry.spoons = row.spoons;
    } else {
      entryMap.set(row.user_id, {
        userId: row.user_id,
        nickname: row.nickname,
        spoons: row.spoons,
        hearts: 0,
        favoriteTemperature: null,
      });
    }
  }
  return [...entryMap.values()];
}

export function listAudienceRankings(
  sessionId: string,
  period: AudienceRankingPeriod,
  liveId?: number,
) {
  return listAudienceRankingsByKey(getSessionKey(sessionId), period, liveId);
}
