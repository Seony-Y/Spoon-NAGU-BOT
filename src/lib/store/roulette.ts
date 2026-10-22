import "server-only";

import { createHash } from "node:crypto";

import { formatMultilineMessages } from "../chat-message";
import { type ParsedSseEvent } from "../spoon-events";
import { parseRouletteKeepCommand } from "../raffle";
import { getDatabase, getSessionKey, getWorkspaceKey } from "./db";

export type RouletteSettings = {
  enabled: boolean;
  cost: number;
  missWeight: number;
};

export type RouletteItem = {
  id: number;
  label: string;
  weight: number;
};

export type RouletteResult = {
  id: number;
  userId: string;
  nickname: string;
  itemLabel: string | null;
  isMiss: boolean;
  spoons: number;
  createdAt: number;
};

export type RouletteKeep = {
  userId: string;
  nickname: string;
  itemLabel: string;
  count: number;
  updatedAt: number;
};

export function getRouletteSettingsByKey(sessionKey: string): RouletteSettings {
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  database.prepare(`
    INSERT OR IGNORE INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
    VALUES (?, 0, 20, 0)
  `).run(workspaceKey);
  const row = database.prepare(`
    SELECT enabled, cost, miss_weight FROM roulette_settings WHERE workspace_key = ?
  `).get(workspaceKey) as { enabled: number; cost: number; miss_weight: number };
  return {
    enabled: row.enabled === 1,
    cost: row.cost,
    missWeight: row.miss_weight,
  };
}

export function getRouletteSettings(sessionId: string) {
  return getRouletteSettingsByKey(getSessionKey(sessionId));
}

export function updateRouletteSettings(sessionId: string, settings: RouletteSettings) {
  updateRouletteSettingsByKey(getSessionKey(sessionId), settings);
}

export function updateRouletteSettingsByKey(sessionKey: string, settings: RouletteSettings) {
  const workspaceKey = getWorkspaceKey(sessionKey);
  getDatabase().prepare(`
    INSERT INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_key) DO UPDATE SET
      enabled = excluded.enabled,
      cost = excluded.cost,
      miss_weight = excluded.miss_weight
  `).run(workspaceKey, settings.enabled ? 1 : 0, settings.cost, settings.missWeight);
}

export function listRouletteItems(sessionId: string): RouletteItem[] {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  return getDatabase().prepare(`
    SELECT id, label, weight FROM roulette_items
    WHERE workspace_key = ? ORDER BY created_at, id
  `).all(workspaceKey).map((row) => {
    const item = row as { id: number; label: string; weight: number };
    return { id: item.id, label: item.label, weight: item.weight };
  });
}

export function saveRouletteItem(
  sessionId: string,
  id: number | null,
  label: string,
  weight: number,
) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  try {
    if (id === null) {
      database.prepare(`
        INSERT INTO roulette_items (workspace_key, label, weight, created_at)
        VALUES (?, ?, ?, ?)
      `).run(workspaceKey, label, weight, Date.now());
      return true;
    }
    const result = database.prepare(`
      UPDATE roulette_items SET label = ?, weight = ?
      WHERE id = ? AND workspace_key = ?
    `).run(label, weight, id, workspaceKey);
    return result.changes > 0;
  } catch {
    return false;
  }
}

export function deleteRouletteItem(sessionId: string, id: number) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  return getDatabase().prepare(`
    DELETE FROM roulette_items WHERE id = ? AND workspace_key = ?
  `).run(id, workspaceKey).changes > 0;
}

export function deleteRouletteDistributionItem(sessionId: string, id: number) {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    const item = database.prepare(`
      SELECT weight FROM roulette_items WHERE id = ? AND workspace_key = ?
    `).get(id, workspaceKey) as { weight: number } | undefined;
    if (!item) {
      database.exec("ROLLBACK");
      return false;
    }
    database.prepare("DELETE FROM roulette_items WHERE id = ? AND workspace_key = ?")
      .run(id, workspaceKey);
    database.prepare(`
      INSERT INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
      VALUES (?, 0, 20, ?)
      ON CONFLICT(workspace_key) DO UPDATE SET
        miss_weight = roulette_settings.miss_weight + excluded.miss_weight
    `).run(workspaceKey, item.weight);
    database.exec("COMMIT");
    return true;
  } catch {
    database.exec("ROLLBACK");
    return false;
  }
}

export function updateRouletteDistribution(
  sessionId: string,
  missPercentage: number,
  items: Array<{ label: string; percentage: number }>,
) {
  if (
    !Number.isSafeInteger(missPercentage)
    || missPercentage < 0
    || items.some((item) => (
      item.label.length < 1
      || item.label.length > 50
      || /[\r\n]/u.test(item.label)
      || !Number.isSafeInteger(item.percentage)
      || item.percentage < 1
    ))
    || missPercentage + items.reduce((total, item) => total + item.percentage, 0) !== 10_000
    || new Set(items.map((item) => item.label.toLocaleLowerCase("ko-KR"))).size !== items.length
  ) {
    return false;
  }

  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM roulette_items WHERE workspace_key = ?").run(workspaceKey);
    const insert = database.prepare(`
      INSERT INTO roulette_items (workspace_key, label, weight, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const now = Date.now();
    items.forEach((item, index) => {
      insert.run(workspaceKey, item.label, item.percentage, now + index);
    });
    database.prepare(`
      INSERT INTO roulette_settings (workspace_key, enabled, cost, miss_weight)
      VALUES (?, 0, 20, ?)
      ON CONFLICT(workspace_key) DO UPDATE SET miss_weight = excluded.miss_weight
    `).run(workspaceKey, missPercentage);
    database.exec("COMMIT");
    return true;
  } catch {
    database.exec("ROLLBACK");
    return false;
  }
}

export function listRouletteResults(sessionId: string, limit = 50): RouletteResult[] {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  return getDatabase().prepare(`
    SELECT id, user_id, nickname, item_label, is_miss, spoons, created_at
    FROM roulette_results WHERE workspace_key = ?
    ORDER BY id DESC LIMIT ?
  `).all(workspaceKey, Math.max(1, Math.min(limit, 200))).map((row) => {
    const result = row as {
      id: number;
      user_id: string;
      nickname: string;
      item_label: string | null;
      is_miss: number;
      spoons: number;
      created_at: number;
    };
    return {
      id: result.id,
      userId: result.user_id,
      nickname: result.nickname,
      itemLabel: result.item_label,
      isMiss: result.is_miss === 1,
      spoons: result.spoons,
      createdAt: result.created_at,
    };
  });
}

export function listRouletteKeeps(sessionId: string): RouletteKeep[] {
  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  return getDatabase().prepare(`
    SELECT user_id, nickname, item_label, count, updated_at
    FROM roulette_keeps WHERE workspace_key = ?
    ORDER BY nickname COLLATE NOCASE, updated_at DESC, item_label COLLATE NOCASE
  `).all(workspaceKey).map((row) => {
    const keep = row as {
      user_id: string;
      nickname: string;
      item_label: string;
      count: number;
      updated_at: number;
    };
    return {
      userId: keep.user_id,
      nickname: keep.nickname,
      itemLabel: keep.item_label,
      count: keep.count,
      updatedAt: keep.updated_at,
    };
  });
}

export function updateRouletteKeeps(
  sessionId: string,
  items: Array<{ userId: string; itemLabel: string; count: number }>,
) {
  if (
    items.length === 0
    || items.some((item) => (
      !item.userId
      || !item.itemLabel
      || !Number.isSafeInteger(item.count)
      || item.count < 1
      || item.count > 1_000_000
    ))
    || new Set(items.map((item) => `${item.userId}\u0000${item.itemLabel}`)).size !== items.length
  ) {
    return false;
  }

  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  const findKeep = database.prepare(`
    SELECT count FROM roulette_keeps
    WHERE workspace_key = ? AND user_id = ? AND item_label = ?
  `);
  const updateKeep = database.prepare(`
    UPDATE roulette_keeps SET count = ?, updated_at = ?
    WHERE workspace_key = ? AND user_id = ? AND item_label = ?
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    const keeps = items.map((item) => ({
      ...item,
      currentCount: (findKeep.get(
        workspaceKey,
        item.userId,
        item.itemLabel,
      ) as { count: number } | undefined)?.count,
    }));
    if (keeps.some((keep) => keep.currentCount === undefined)) {
      database.exec("ROLLBACK");
      return false;
    }

    const now = Date.now();
    for (const keep of keeps) {
      updateKeep.run(keep.count, now, workspaceKey, keep.userId, keep.itemLabel);
    }
    database.exec("COMMIT");
    return true;
  } catch {
    database.exec("ROLLBACK");
    return false;
  }
}

export function deleteRouletteKeeps(
  sessionId: string,
  items: Array<{ userId: string; itemLabel: string }>,
) {
  if (
    items.length === 0
    || items.some((item) => !item.userId || !item.itemLabel)
    || new Set(items.map((item) => `${item.userId}\u0000${item.itemLabel}`)).size !== items.length
  ) {
    return false;
  }

  const workspaceKey = getWorkspaceKey(getSessionKey(sessionId));
  const database = getDatabase();
  const findKeep = database.prepare(`
    SELECT 1 FROM roulette_keeps
    WHERE workspace_key = ? AND user_id = ? AND item_label = ?
  `);
  const deleteKeep = database.prepare(`
    DELETE FROM roulette_keeps
    WHERE workspace_key = ? AND user_id = ? AND item_label = ?
  `);
  database.exec("BEGIN IMMEDIATE");
  try {
    if (items.some((item) => !findKeep.get(workspaceKey, item.userId, item.itemLabel))) {
      database.exec("ROLLBACK");
      return false;
    }
    for (const item of items) deleteKeep.run(workspaceKey, item.userId, item.itemLabel);
    database.exec("COMMIT");
    return true;
  } catch {
    database.exec("ROLLBACK");
    return false;
  }
}

export function applyRouletteKeepCommand(
  sessionKey: string,
  message: string,
  isDj: boolean,
) {
  const command = parseRouletteKeepCommand(message);
  if (!command) return null;
  if (command.kind === "invalid_count") return "삭제할 수량은 1개 이상이어야 해요.";
  if (command.kind === "usage") {
    return "사용법: !킵 삭제 닉네임 / 경품 이름 / 수량 (수량을 빼면 1개)";
  }
  if (!isDj) return "킵 삭제는 DJ만 할 수 있어요.";

  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  const keeps = database.prepare(`
    SELECT user_id, nickname, item_label, count FROM roulette_keeps
    WHERE workspace_key = ?
      AND nickname = ? COLLATE NOCASE
      AND item_label = ? COLLATE NOCASE
  `).all(workspaceKey, command.nickname, command.itemLabel) as Array<{
    user_id: string;
    nickname: string;
    item_label: string;
    count: number;
  }>;
  if (keeps.length === 0) return "해당 킵을 찾지 못했어요. 닉네임과 경품 이름을 확인해 주세요.";
  if (new Set(keeps.map((keep) => keep.user_id)).size > 1) {
    return "같은 닉네임의 청취자가 여러 명이라 구분할 수 없어요. 대시보드에서 직접 수정해 주세요.";
  }
  const keep = keeps[0];
  if (keeps.length > 1) return "같은 이름의 킵이 여러 개라 대시보드에서 직접 수정해 주세요.";
  if (command.count > keep.count) {
    return `${keep.nickname}님의 ${keep.item_label} 킵은 ${keep.count.toLocaleString("ko-KR")}개만 있어요.`;
  }

  if (command.count === keep.count) {
    database.prepare(`
      DELETE FROM roulette_keeps
      WHERE workspace_key = ? AND user_id = ? AND item_label = ?
    `).run(workspaceKey, keep.user_id, keep.item_label);
    return `${keep.nickname}님의 ${keep.item_label} 킵을 모두 삭제했어요.`;
  }
  const remaining = keep.count - command.count;
  database.prepare(`
    UPDATE roulette_keeps SET count = ?, updated_at = ?
    WHERE workspace_key = ? AND user_id = ? AND item_label = ?
  `).run(remaining, Date.now(), workspaceKey, keep.user_id, keep.item_label);
  return `${keep.nickname}님의 ${keep.item_label} 킵 ${command.count.toLocaleString("ko-KR")}개를 삭제했어요. (${remaining.toLocaleString("ko-KR")}개 남음)`;
}

export type RouletteDraw = {
  nickname: string;
  itemLabel: string | null;
  isMiss: boolean;
  keepCount: number | null;
};

export function applyRouletteDonation(
  sessionKey: string,
  liveId: number,
  event: Extract<ParsedSseEvent, { event: "donation" }>,
  random: () => number = Math.random,
): RouletteDraw | null {
  const settings = getRouletteSettingsByKey(sessionKey);
  if (!settings.enabled || event.data.amount < settings.cost) return null;
  const workspaceKey = getWorkspaceKey(sessionKey);
  const database = getDatabase();
  const items = database.prepare(`
    SELECT id, label, weight FROM roulette_items
    WHERE workspace_key = ? ORDER BY created_at, id
  `).all(workspaceKey) as Array<{ id: number; label: string; weight: number }>;
  const itemWeight = items.reduce((total, item) => total + item.weight, 0);
  const configuredTotal = itemWeight + settings.missWeight;
  const totalWeight = configuredTotal > 0 ? configuredTotal : 10_000;

  let ticket = Math.min(Math.max(random(), 0), 0.9999999999999999) * totalWeight;
  let selected: { id: number; label: string } | null = null;
  for (const item of items) {
    if (ticket < item.weight) {
      selected = item;
      break;
    }
    ticket -= item.weight;
  }
  const nickname = event.data.user.nickname?.trim().slice(0, 50) || "청취자";
  const eventId = event.id || createHash("sha256")
    .update(`roulette:${liveId}:${JSON.stringify(event.data)}`)
    .digest("hex");
  const now = Date.now();

  database.exec("BEGIN IMMEDIATE");
  try {
    const inserted = database.prepare(`
      INSERT OR IGNORE INTO roulette_results (
        workspace_key, live_id, event_id, user_id, nickname,
        item_label, is_miss, spoons, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      workspaceKey,
      liveId,
      eventId,
      event.data.user.id,
      nickname,
      selected?.label ?? null,
      selected ? 0 : 1,
      event.data.amount,
      now,
    );
    if (inserted.changes === 0) {
      database.exec("ROLLBACK");
      return null;
    }

    let keepCount: number | null = null;
    if (selected) {
      database.prepare(`
        INSERT INTO roulette_keeps (
          workspace_key, user_id, nickname, item_label, count, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(workspace_key, user_id, item_label) DO UPDATE SET
          nickname = excluded.nickname,
          count = roulette_keeps.count + 1,
          updated_at = excluded.updated_at
      `).run(workspaceKey, event.data.user.id, nickname, selected.label, now);
      keepCount = (database.prepare(`
        SELECT count FROM roulette_keeps
        WHERE workspace_key = ? AND user_id = ? AND item_label = ?
      `).get(workspaceKey, event.data.user.id, selected.label) as { count: number }).count;
    }
    database.exec("COMMIT");
    return {
      nickname,
      itemLabel: selected?.label ?? null,
      isMiss: selected === null,
      keepCount,
    };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getRouletteKeepCommandRepliesByKey(
  sessionKey: string,
  message: string,
  userId: string,
  nickname: string | null,
) {
  if (message.trim() !== "!내 킵") return null;
  const displayName = nickname?.trim() || "청취자";
  const workspaceKey = getWorkspaceKey(sessionKey);
  const keeps = getDatabase().prepare(`
    SELECT item_label, SUM(count) AS count
    FROM roulette_keeps
    WHERE workspace_key = ? AND user_id = ?
    GROUP BY item_label ORDER BY MAX(updated_at) DESC, item_label COLLATE NOCASE
  `).all(workspaceKey, userId) as Array<{ item_label: string; count: number }>;
  if (keeps.length === 0) return [`${displayName}님은 아직 킵이 없어요.`];

  return formatMultilineMessages(
    `${displayName}님의 킵:`,
    "킵 (이어서)",
    keeps.map((keep) => `${keep.item_label} ${keep.count.toLocaleString("ko-KR")}개`),
  );
}
