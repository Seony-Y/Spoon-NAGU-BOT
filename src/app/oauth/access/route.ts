import { type NextRequest, NextResponse } from "next/server";
import {
  OAUTH_ACCESS_COOKIE,
  OAUTH_ACCESS_MAX_AGE,
  createOAuthAccessProof,
  isAccessCodeConfigured,
  verifyAccessCode,
} from "@/lib/access-code";
import { buildApplicationUrl } from "@/lib/spoon";

export const runtime = "nodejs";

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type AttemptState = { count: number; resetAt: number };

const globalForAccess = globalThis as typeof globalThis & {
  naguOAuthAccessAttempts?: Map<string, AttemptState>;
};

const attempts = globalForAccess.naguOAuthAccessAttempts ?? new Map<string, AttemptState>();
globalForAccess.naguOAuthAccessAttempts = attempts;

function getClientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function getAttemptState(clientKey: string, now: number) {
  const current = attempts.get(clientKey);
  if (current && current.resetAt > now) return current;
  const next = { count: 0, resetAt: now + ATTEMPT_WINDOW_MS };
  attempts.set(clientKey, next);
  return next;
}

export async function POST(request: NextRequest) {
  if (!isAccessCodeConfigured()) {
    return NextResponse.json({ error: "configuration" }, { status: 503 });
  }

  const clientKey = getClientKey(request);
  const attempt = getAttemptState(clientKey, Date.now());
  if (attempt.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const formData = await request.formData();
  if (!verifyAccessCode(String(formData.get("code") ?? ""))) {
    attempt.count += 1;
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  }

  const proof = createOAuthAccessProof();
  if (!proof) return NextResponse.json({ error: "configuration" }, { status: 503 });
  attempts.delete(clientKey);

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