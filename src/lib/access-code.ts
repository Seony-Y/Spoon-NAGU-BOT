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

export function createOAuthAccessProof() {
  const accessCode = getAccessCode();
  const secret = getSessionSecret();
  if (!accessCode || !secret) return null;
  return createHmac("sha256", secret).update(`nagu-oauth-access:${accessCode}`).digest("base64url");
}

export function verifyOAuthAccessProof(value: string | undefined) {
  const expected = createOAuthAccessProof();
  if (!value || !expected) return false;
  return timingSafeEqual(digest(value), digest(expected));
}