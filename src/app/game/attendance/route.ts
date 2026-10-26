import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/session";
import { setAttendanceAnnounce } from "@/lib/session-store";
import { buildApplicationUrl } from "@/lib/spoon";
import { readFormData } from "@/lib/request-body";

export const runtime = "nodejs";

function redirect(request: NextRequest, status: string) {
  const target = buildApplicationUrl("/", request.url);
  target.searchParams.set("tab", "game");
  target.searchParams.set("game", "attendance");
  target.searchParams.set("attendance", status);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) return redirect(request, "authentication_required");

  const formData = await readFormData(request);
  const announce = String(formData.get("announce") ?? "");
  if (announce !== "on" && announce !== "off") return redirect(request, "invalid_action");
  setAttendanceAnnounce(sessionId, announce === "on");
  return redirect(request, `announce_${announce}`);
}
