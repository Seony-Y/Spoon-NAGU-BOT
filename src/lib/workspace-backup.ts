import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  exportWorkspaceData,
  restoreWorkspaceData,
  WORKSPACE_BACKUP_TABLES,
  type WorkspaceBackupData,
  type WorkspaceBackupValue,
} from "./session-store";

const BACKUP_VERSION = 1;
const MAX_ROWS_PER_TABLE = 50_000;

type BackupBody = {
  format: "nagu-bot-workspace";
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  includesAudience: boolean;
  data: WorkspaceBackupData;
};

export type SignedWorkspaceBackup = BackupBody & {
  signature: string;
};

function getBackupSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return secret;
}

function signBackup(body: BackupBody) {
  return createHmac("sha256", getBackupSecret())
    .update("nagu-workspace-backup-v1\0")
    .update(JSON.stringify(body))
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBackupValue(value: unknown): value is WorkspaceBackupValue {
  return value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function isValidData(data: unknown, includesAudience: boolean): data is WorkspaceBackupData {
  if (!isRecord(data) || !isRecord(data.tables)) return false;
  const tables: Record<string, unknown> = data.tables;
  const specifications = includesAudience
    ? [...WORKSPACE_BACKUP_TABLES.core, ...WORKSPACE_BACKUP_TABLES.audience]
    : [...WORKSPACE_BACKUP_TABLES.core];
  const expectedNames = new Set<string>(specifications.map((specification) => specification.name));
  if (Object.keys(tables).some((name) => !expectedNames.has(name))) return false;
  if (WORKSPACE_BACKUP_TABLES.core.some(({ name }) => !Object.hasOwn(tables, name))) return false;
  if (includesAudience && WORKSPACE_BACKUP_TABLES.audience.some(({ name }) => !Object.hasOwn(tables, name))) {
    return false;
  }

  for (const specification of specifications) {
    const rows = tables[specification.name];
    if (!Array.isArray(rows) || rows.length > MAX_ROWS_PER_TABLE) return false;
    const expectedColumns = new Set<string>(specification.columns);
    for (const row of rows) {
      if (!isRecord(row)) return false;
      const keys = Object.keys(row);
      if (keys.length !== expectedColumns.size || keys.some((key) => !expectedColumns.has(key))) return false;
      if (keys.some((key) => !isBackupValue(row[key]))) return false;
    }
  }
  return true;
}

export function createSignedWorkspaceBackup(sessionId: string, includeAudience: boolean) {
  const body: BackupBody = {
    format: "nagu-bot-workspace",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    includesAudience: includeAudience,
    data: exportWorkspaceData(sessionId, includeAudience),
  };
  return { ...body, signature: signBackup(body) } satisfies SignedWorkspaceBackup;
}

export function parseSignedWorkspaceBackup(value: unknown): SignedWorkspaceBackup | null {
  if (!isRecord(value)
    || value.format !== "nagu-bot-workspace"
    || value.version !== BACKUP_VERSION
    || typeof value.exportedAt !== "string"
    || Number.isNaN(Date.parse(value.exportedAt))
    || typeof value.includesAudience !== "boolean"
    || typeof value.signature !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.signature)
    || !isValidData(value.data, value.includesAudience)) {
    return null;
  }
  const body: BackupBody = {
    format: value.format,
    version: value.version,
    exportedAt: value.exportedAt,
    includesAudience: value.includesAudience,
    data: value.data,
  };
  const expected = Buffer.from(signBackup(body), "hex");
  const received = Buffer.from(value.signature, "hex");
  return timingSafeEqual(expected, received) ? { ...body, signature: value.signature } : null;
}

export function restoreSignedWorkspaceBackup(sessionId: string, value: unknown) {
  const backup = parseSignedWorkspaceBackup(value);
  return backup ? restoreWorkspaceData(sessionId, backup.data) : false;
}