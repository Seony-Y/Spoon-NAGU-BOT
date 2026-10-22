import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const OAUTH_ACCESS_COOKIE = "nagu_oauth_access";
export const OAUTH_ACCESS_MAX_AGE = 10 * 60;

function getAccessCode() {
  return process.env.ACCESS_CODE?.trim() || null;
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isAccessCodeConfigured() {
  return getAccessCode() !== null && getSessionSecret() !== null;
}

export function verifyAccessCode(value: string) {
  const accessCode = getAccessCode();
  if (!accessCode) return false;
  return timingSafeEqual(digest(value.trim()), digest(accessCode));
}

function signProof(issuedAt: number) {
  const accessCode = getAccessCode();
  const secret = getSessionSecret();
  if (!accessCode || !secret) return null;
  return createHmac("sha256", secret)
    .update(`nagu-oauth-access:${issuedAt}:${accessCode}`)
    .digest("base64url");
}

// The proof carries its issue time so a leaked cookie value stops working after
// OAUTH_ACCESS_MAX_AGE even if it is replayed outside the browser.
export function createOAuthAccessProof(now = Date.now()) {
  const signature = signProof(now);
  return signature ? `${now}.${signature}` : null;
}

export function verifyOAuthAccessProof(value: string | undefined, now = Date.now()) {
  const match = /^(\d{1,15})\.([\w-]+)$/u.exec(value ?? "");
  if (!match) return false;
  const issuedAt = Number(match[1]);
  if (issuedAt > now + 60_000 || now - issuedAt > OAUTH_ACCESS_MAX_AGE * 1000) return false;
  const expected = signProof(issuedAt);
  if (!expected) return false;
  return timingSafeEqual(digest(match[2]), digest(expected));
}