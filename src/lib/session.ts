import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { SpoonToken } from "./spoon";

export const SESSION_COOKIE = "nagu_session";
export const STATE_COOKIE = "nagu_oauth_state";

export type StoredSpoonToken = SpoonToken & {
  expires_at: number;
};

export class SessionConfigurationError extends Error {
  constructor() {
    super("SESSION_SECRET must be at least 32 characters");
    this.name = "SessionConfigurationError";
  }
}

function getEncryptionKey() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new SessionConfigurationError();
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptToken(token: SpoonToken | StoredSpoonToken) {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), initializationVector);
  const plaintext = JSON.stringify("expires_at" in token ? token : {
    ...token,
    expires_at: Date.now() + token.expires_in * 1000,
  });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return Buffer.concat([initializationVector, authenticationTag, encrypted]).toString("base64url");
}

export function decryptToken(payload: string): StoredSpoonToken {
  const buffer = Buffer.from(payload, "base64url");

  if (buffer.length <= 28) {
    throw new Error("Invalid encrypted session");
  }

  const initializationVector = buffer.subarray(0, 12);
  const authenticationTag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), initializationVector);
  decipher.setAuthTag(authenticationTag);

  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as StoredSpoonToken;
}