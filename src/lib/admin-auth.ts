import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

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

