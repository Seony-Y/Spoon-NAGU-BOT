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

const donation = parseSseFrame(
  'event: donation\nid: gift-1\ndata: {"user":{"id":"fan-1","nickname":"후원자"},"amount":20,"message":null,"time":"2026-10-01T00:00:00Z","gift":{"id":"item-20","name":"테스트 스푼"}}',
);
assert.equal(donation?.event, "donation");
assert.deepEqual(donation?.data.gift, { id: "item-20", name: "테스트 스푼" });

console.log(
  "SSE parser checks passed: CRLF, heartbeat, fragmented, multiline, extra fields, unknown, malformed",
);