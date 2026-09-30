import assert from "node:assert/strict";

import { extractSseFrames, parseSseFrame } from "../src/lib/spoon-events.ts";

const firstChunk = extractSseFrames(
  'event: chat\r\nid: evt-1\r\ndata: {"user":{"nickname":"DJ"},"message":"hello"}\r\n\r\n' +
    ':heartbeat\r\n\r\nevent: like\ndata: {"user":{},"amount":1',
);

assert.equal(firstChunk.frames.length, 2);
assert.deepEqual(parseSseFrame(firstChunk.frames[0]), {
  event: "chat",
  id: "evt-1",
  data: { user: { nickname: "DJ" }, message: "hello" },
});
assert.equal(parseSseFrame(firstChunk.frames[1]), null);

const secondChunk = extractSseFrames(`${firstChunk.remainder}}\n\n`);
assert.equal(secondChunk.frames.length, 1);
assert.equal(parseSseFrame(secondChunk.frames[0])?.event, "like");

const multiline = parseSseFrame(
  'event: chat\ndata: {"user":{}\ndata: ,"message":"split"}',
);
assert.equal(multiline?.data.message, "split");
assert.equal(parseSseFrame("event: unknown\ndata: {}"), null);
assert.equal(parseSseFrame("event: chat\ndata: not-json"), null);

console.log(
  "SSE parser checks passed: CRLF, heartbeat, fragmented, multiline, unknown, malformed",
);