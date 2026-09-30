import { type NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/admin-auth";
import { blockBotByKey } from "@/lib/bot-runtime";
import { listAdminSessions, setSessionBlockedByKey } from "@/lib/session-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  if (!verifyAdminPassword(String(formData.get("password") ?? ""))) {
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const sessionKey = String(formData.get("sessionKey") ?? "");
  const mode = formData.get("mode");
  if (mode === "list") return NextResponse.json({ sessions: listAdminSessions() });
  if (!/^[a-f0-9]{64}$/.test(sessionKey) || (mode !== "block" && mode !== "unblock")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const blocked = mode === "block";
  if (!setSessionBlockedByKey(sessionKey, blocked)) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (blocked) blockBotByKey(sessionKey);
  return NextResponse.json({ sessions: listAdminSessions() });
}