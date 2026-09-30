import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { blockBotByKey } from "@/lib/bot-runtime";
import { setSessionBlockedByKey } from "@/lib/session-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!verifyAdminToken(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.redirect(new URL("/admin?error=authentication_required", request.url), 303);
  }

  const formData = await request.formData();
  const sessionKey = String(formData.get("sessionKey") ?? "");
  const mode = formData.get("mode");
  if (!/^[a-f0-9]{64}$/.test(sessionKey) || (mode !== "block" && mode !== "unblock")) {
    return NextResponse.redirect(new URL("/admin?error=invalid_request", request.url), 303);
  }

  const blocked = mode === "block";
  if (!setSessionBlockedByKey(sessionKey, blocked)) {
    return NextResponse.redirect(new URL("/admin?error=session_not_found", request.url), 303);
  }
  if (blocked) blockBotByKey(sessionKey);
  return NextResponse.redirect(new URL(`/admin?status=${blocked ? "blocked" : "unblocked"}`, request.url), 303);
}