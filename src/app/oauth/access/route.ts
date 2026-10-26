import { type NextRequest, NextResponse } from "next/server";
import {
  OAUTH_ACCESS_COOKIE,
  OAUTH_ACCESS_MAX_AGE,
  createOAuthAccessProof,
  isAccessCodeConfigured,
  verifyAccessCode,
} from "@/lib/access-code";
import { createFailureLimiter, getClientKey } from "@/lib/rate-limit";
import { buildApplicationUrl } from "@/lib/spoon";
import { readFormData } from "@/lib/request-body";

export const runtime = "nodejs";

const limiter = createFailureLimiter("oauth-access", {
  windowMs: 10 * 60 * 1000,
  maxPerClient: 5,
  maxGlobal: 100,
});

export async function POST(request: NextRequest) {
  if (!isAccessCodeConfigured()) {
    return NextResponse.json({ error: "configuration" }, { status: 503 });
  }

  const clientKey = getClientKey(request);
  if (limiter.isLimited(clientKey)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const formData = await readFormData(request);
  if (!verifyAccessCode(String(formData.get("code") ?? ""))) {
    limiter.recordFailure(clientKey);
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const proof = createOAuthAccessProof();
  if (!proof) return NextResponse.json({ error: "configuration" }, { status: 503 });
  limiter.reset(clientKey);

  const applicationUrl = buildApplicationUrl("/", request.url);
  const response = NextResponse.json({ verified: true });
  response.cookies.set(OAUTH_ACCESS_COOKIE, proof, {
    httpOnly: true,
    secure: applicationUrl.protocol === "https:",
    sameSite: "lax",
    path: "/oauth",
    maxAge: OAUTH_ACCESS_MAX_AGE,
    priority: "high",
  });
  return response;
}
