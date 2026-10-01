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

process.env.ACCESS_CODE = "changed-entry-code";
assert.equal(verifyOAuthAccessProof(proof), false);

console.log("Access code checks passed: validation and signed OAuth proof");