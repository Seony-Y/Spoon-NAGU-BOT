import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "nagu_admin";

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() || null;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isAdminConfigured() {
  return getAdminPassword() !== null;
}

export function verifyAdminPassword(password: string) {
  const expected = getAdminPassword();
  if (!expected) return false;
  return timingSafeEqual(digest(password), digest(expected));
}

export function createAdminToken() {
  const password = getAdminPassword();
  return password ? digest(`nagu-admin-session:${password}`).toString("base64url") : null;
}

export function verifyAdminToken(token: string | undefined) {
  const expected = createAdminToken();
  if (!token || !expected) return false;
  const received = Buffer.from(token);
  const expectedBytes = Buffer.from(expected);
  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes);
}