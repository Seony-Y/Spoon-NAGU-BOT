import { NextResponse } from "next/server";
import { checkDatabase, getAppState } from "@/lib/session-store";

export const runtime = "nodejs";

// Also touches SQLite, so a missing volume or broken database fails the health
// check instead of passing silently.
export function GET() {
  try {
    checkDatabase();
    return NextResponse.json({
      service: "nagu-bot",
      status: "ok",
      lastBackup: getAppState("maintenance:last_backup"),
    });
  } catch {
    return NextResponse.json({ service: "nagu-bot", status: "database_unavailable" }, { status: 503 });
  }
}
