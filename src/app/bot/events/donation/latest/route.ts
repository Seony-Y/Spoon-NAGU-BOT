import { type NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { getBotSnapshot } from "@/lib/bot-runtime";
import { SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await getAuthSession(sessionId);
  if (!sessionId || !session) {
    return NextResponse.json(
      { error: "Spoon DJ 계정 로그인이 필요합니다." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const event = getBotSnapshot(sessionId).events.find((item) => item.type === "donation");
  if (!event || event.type !== "donation") {
    return NextResponse.json(
      {
        error: "최근 후원 이벤트가 없습니다.",
        next: "봇이 참여 중인 방송에서 후원한 뒤 이 주소를 다시 열어주세요.",
      },
      { status: 404, headers: noStoreHeaders },
    );
  }

  return NextResponse.json(
    {
      eventId: event.id ?? null,
      receivedAt: event.receivedAt,
      payloadFields: Object.keys(event.data),
      payload: event.data,
    },
    { headers: noStoreHeaders },
  );
}
