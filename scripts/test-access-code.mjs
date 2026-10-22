import assert from "node:assert/strict";

process.env.ACCESS_CODE = "test-entry-code";
process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters";

const {
  createOAuthAccessProof,
  isAccessCodeConfigured,
  verifyAccessCode,
  verifyOAuthAccessProof,
} = await import("../src/lib/access-code.ts");

assert.equal(isAccessCodeConfigured(), true);
assert.equal(verifyAccessCode("test-entry-code"), true);
assert.equal(verifyAccessCode(" test-entry-code "), true);
assert.equal(verifyAccessCode("wrong-code"), false);

const proof = createOAuthAccessProof();
assert.equal(typeof proof, "string");
assert.equal(verifyOAuthAccessProof(proof), true);
assert.equal(verifyOAuthAccessProof(`${proof}x`), false);

const issuedAt = Date.now() - 11 * 60 * 1000;
assert.equal(verifyOAuthAccessProof(createOAuthAccessProof(issuedAt)), false);
assert.equal(verifyOAuthAccessProof(createOAuthAccessProof(issuedAt), issuedAt + 1000), true);
assert.equal(verifyOAuthAccessProof(proof.replace(/^\d+/u, String(Date.now() + 1))), false);

process.env.ACCESS_CODE = "changed-entry-code";
assert.equal(verifyOAuthAccessProof(proof), false);

console.log("Access code checks passed: validation and signed OAuth proof");