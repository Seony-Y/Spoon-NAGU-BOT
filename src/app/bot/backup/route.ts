import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { ensureBotRunning } from "@/lib/bot-runtime";
import { SESSION_COOKIE } from "@/lib/session";
import { buildApplicationUrl } from "@/lib/spoon";
import {
  createSignedWorkspaceBackup,
  restoreSignedWorkspaceBackup,
} from "@/lib/workspace-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "backup");
  target.searchParams.set("settings", status);
  return NextResponse.redirect(target, 303);
}

async function authenticate(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  return sessionId && session ? sessionId : null;
}

export async function GET(request: NextRequest) {
  const sessionId = await authenticate(request);
  if (!sessionId) return redirect(request, "authentication_required");

  const includeAudience = request.nextUrl.searchParams.get("audience") === "1";
  const backup = createSignedWorkspaceBackup(sessionId, includeAudience);
  const date = new Date().toISOString().slice(0, 10);
  const suffix = includeAudience ? "-full" : "";
  return new NextResponse(`${JSON.stringify(backup, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="nagu-bot-backup-${date}${suffix}.json"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}

export async function POST(request: NextRequest) {
  const sessionId = await authenticate(request);
  if (!sessionId) return redirect(request, "authentication_required");

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BACKUP_BYTES) return redirect(request, "backup_too_large");

  try {
    const formData = await request.formData();
    const file = formData.get("backup");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_BACKUP_BYTES) {
      return redirect(request, file instanceof File && file.size > MAX_BACKUP_BYTES
        ? "backup_too_large"
        : "backup_invalid");
    }
    const parsed = JSON.parse(await file.text()) as unknown;
    if (!restoreSignedWorkspaceBackup(sessionId, parsed)) {
      return redirect(request, "backup_invalid");
    }
    ensureBotRunning(sessionId);
    return redirect(request, "backup_restored");
  } catch {
    return redirect(request, "backup_invalid");
  }
}