import "server-only";

import { getDatabase } from "./db";

// Retention cleanups run once a day by src/lib/maintenance.ts. Each returns the
// number of rows it removed so the run can be logged.

// Sessions signed out long ago (disconnected, revoked, expired) that are not
// running a bot and not blocked by an admin. Workspace data is keyed by
// workspace, not session, so nothing the DJ saved is lost.
export function deleteStaleSessions(olderThan: number) {
  return getDatabase().prepare(`
    DELETE FROM oauth_sessions
    WHERE auth_valid = 0 AND bot_enabled = 0 AND blocked = 0 AND updated_at < ?
  `).run(olderThan).changes as number;
}

export function deleteOldRouletteResults(olderThan: number) {
  return getDatabase().prepare("DELETE FROM roulette_results WHERE created_at < ?").run(olderThan).changes as number;
}

// Folds the audience events and Spoon-ranking snapshots of broadcasts that
// ended before the cutoff into per-listener totals (audience_archive), then
// deletes them. Spoons use the same rule as the rankings: per broadcast and
// listener, the larger of event spoons and snapshot spoons.
export function compactAudienceHistory(olderThan: number) {
  const database = getDatabase();
  const oldLives = database.prepare(`
    SELECT workspace_key, live_id FROM (
      SELECT workspace_key, live_id, MAX(occurred_at) AS last_at FROM audience_events GROUP BY workspace_key, live_id
      UNION ALL
      SELECT workspace_key, live_id, MAX(updated_at) AS last_at FROM audience_spoon_snapshots GROUP BY workspace_key, live_id
    )
    GROUP BY workspace_key, live_id
    HAVING MAX(last_at) < ?
  `).all(olderThan) as Array<{ workspace_key: string; live_id: number }>;
  if (oldLives.length === 0) return 0;

  const totals = database.prepare(`
    WITH event_totals AS (
      SELECT user_id, SUM(spoons) AS spoons, SUM(hearts) AS hearts, MAX(favorite_temperature) AS favorite_temperature
      FROM audience_events WHERE workspace_key = ? AND live_id = ? GROUP BY user_id
    ), snapshot_totals AS (
      SELECT user_id, MAX(spoons) AS spoons
      FROM audience_spoon_snapshots WHERE workspace_key = ? AND live_id = ? GROUP BY user_id
    ), listeners AS (
      SELECT user_id FROM event_totals UNION SELECT user_id FROM snapshot_totals
    )
    SELECT l.user_id,
           MAX(COALESCE(e.spoons, 0), COALESCE(s.spoons, 0)) AS spoons,
           COALESCE(e.hearts, 0) AS hearts,
           e.favorite_temperature
    FROM listeners l
    LEFT JOIN event_totals e ON e.user_id = l.user_id
    LEFT JOIN snapshot_totals s ON s.user_id = l.user_id
  `);
  const archive = database.prepare(`
    INSERT INTO audience_archive (workspace_key, user_id, spoons, hearts, favorite_temperature)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(workspace_key, user_id) DO UPDATE SET
      spoons = audience_archive.spoons + excluded.spoons,
      hearts = audience_archive.hearts + excluded.hearts,
      favorite_temperature = MAX(COALESCE(audience_archive.favorite_temperature, excluded.favorite_temperature),
                                 COALESCE(excluded.favorite_temperature, audience_archive.favorite_temperature))
  `);
  const deleteEvents = database.prepare("DELETE FROM audience_events WHERE workspace_key = ? AND live_id = ?");
  const deleteSnapshots = database.prepare("DELETE FROM audience_spoon_snapshots WHERE workspace_key = ? AND live_id = ?");

  let removed = 0;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const { workspace_key: workspaceKey, live_id: liveId } of oldLives) {
      const rows = totals.all(workspaceKey, liveId, workspaceKey, liveId) as Array<{
        user_id: string;
        spoons: number;
        hearts: number;
        favorite_temperature: number | null;
      }>;
      for (const row of rows) {
        archive.run(workspaceKey, row.user_id, row.spoons, row.hearts, row.favorite_temperature);
      }
      removed += Number(deleteEvents.run(workspaceKey, liveId).changes);
      removed += Number(deleteSnapshots.run(workspaceKey, liveId).changes);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return removed;
}
