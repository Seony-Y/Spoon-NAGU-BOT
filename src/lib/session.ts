import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { SpoonToken } from "./spoon";

export const SESSION_COOKIE = "nagu_session";
export const STATE_COOKIE = "nagu_oauth_state";

function getEncryptionKey() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptSession(token: SpoonToken) {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), initializationVector);
  const plaintext = JSON.stringify({
    ...token,
    expires_at: Date.now() + token.expires_in * 1000,
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return Buffer.concat([initializationVector, authenticationTag, encrypted]).toString("base64url");
}