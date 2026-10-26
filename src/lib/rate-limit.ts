import type { NextRequest } from "next/server";

type AttemptState = { count: number; resetAt: number };

const MAX_TRACKED_CLIENTS = 10_000;

// Failed-attempt limiter. The per-client key comes from proxy headers, which a
// client can forge, so a global failure cap bounds guessing regardless of key.
export function createFailureLimiter(name: string, options: {
  windowMs: number;
  maxPerClient: number;
  maxGlobal: number;
}) {
  const globalStore = globalThis as typeof globalThis & {
    naguFailureLimiters?: Map<string, { clients: Map<string, AttemptState>; global: AttemptState }>;
  };
  globalStore.naguFailureLimiters ??= new Map();
  const state = globalStore.naguFailureLimiters.get(name)
    ?? { clients: new Map<string, AttemptState>(), global: { count: 0, resetAt: 0 } };
  globalStore.naguFailureLimiters.set(name, state);

  function current(entry: AttemptState | undefined, now: number) {
    return entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + options.windowMs };
  }

  function prune(now: number) {
    if (state.clients.size < MAX_TRACKED_CLIENTS) return;
    for (const [key, entry] of state.clients) {
      if (entry.resetAt <= now) state.clients.delete(key);
    }
    if (state.clients.size >= MAX_TRACKED_CLIENTS) state.clients.clear();
  }

  return {
    isLimited(clientKey: string, now = Date.now()) {
      state.global = current(state.global, now);
      return state.global.count >= options.maxGlobal
        || current(state.clients.get(clientKey), now).count >= options.maxPerClient;
    },
    recordFailure(clientKey: string, now = Date.now()) {
      prune(now);
      const client = current(state.clients.get(clientKey), now);
      client.count += 1;
      state.clients.set(clientKey, client);
      state.global = current(state.global, now);
      state.global.count += 1;
    },
    reset(clientKey: string) {
      state.clients.delete(clientKey);
    },
  };
}

// The last X-Forwarded-For entry is the one added by the proxy in front of the
// app; earlier entries come from the client and can be anything, which made
// every attempt look like a new client and left only the global limit.
export function getClientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}
