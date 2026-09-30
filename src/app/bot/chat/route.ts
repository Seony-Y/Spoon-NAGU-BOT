import { type NextRequest, NextResponse } from "next/server";
import { sendChat } from "@/lib/chat";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.redirect(new URL("/?tab=bot&error=authentication_required", request.url), 303);
  }

  const formData = await request.formData();
  const message = formData.get("message");
  const result = await sendChat(sessionId, typeof message === "string" ? message : "");
  return NextResponse.redirect(new URL(`/?tab=bot&chat=${result.kind}`, request.url), 303);
}