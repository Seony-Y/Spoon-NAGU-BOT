import { type NextRequest, NextResponse } from "next/server";
import { verifyAdminPassword } from "@/lib/admin-auth";
import { blockBotByKey } from "@/lib/bot-runtime";
import { createFailureLimiter, getClientKey } from "@/lib/rate-limit";
import { listAdminSessions, setSessionBlockedByKey } from "@/lib/session-store";

export const runtime = "nodejs";

const limiter = createFailureLimiter("admin", {
  windowMs: 10 * 60 * 1000,
  maxPerClient: 10,
  maxGlobal: 30,
});

export async function POST(request: NextRequest) {
  const clientKey = getClientKey(request);
  if (limiter.isLimited(clientKey)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const formData = await request.formData().catch(() => new FormData());
  if (!verifyAdminPassword(String(formData.get("password") ?? ""))) {
    limiter.recordFailure(clientKey);
    return NextResponse.json({ error: "authentication_required" }, { status: 401 });
  }

  const sessionKey = String(formData.get("sessionKey") ?? "");
  const mode = formData.get("mode");
  if (mode === "list") return NextResponse.json({ sessions: listAdminSessions() });
  if (!/^[a-f0-9]{64}$/.test(sessionKey) || (mode !== "block" && mode !== "unblock")) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const blocked = mode === "block";
  const affected = setSessionBlockedByKey(sessionKey, blocked);
  if (affected.length === 0) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }
  if (blocked) for (const key of affected) blockBotByKey(key);
  return NextResponse.json({ sessions: listAdminSessions() });
}
