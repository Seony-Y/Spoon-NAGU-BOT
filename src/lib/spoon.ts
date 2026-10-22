const DEFAULT_BASE_URL = "https://kr-openapi.spooncast.net";
export const REQUIRED_SCOPES = [
  "live.read",
  "events.chat",
  "events.presence",
  "events.like",
  "events.donation",
  "chat.send",
  "listeners.read",
  "fans.read",
] as const;
const DEFAULT_SCOPES = REQUIRED_SCOPES.join(" ");

// Requested only when listed in SPOON_SCOPES, because requesting a scope the app
// is not approved for in Spoon Developers blocks consent for every DJ. Features
// that depend on them turn on only when the DJ actually granted the scope.
export const OPTIONAL_SCOPES = ["me.read", "events.follow", "dj.follow", "donations.read"] as const;

export function hasScope(scope: string | undefined, name: string) {
  return (scope ?? "").split(/\s+/).includes(name);
}

// Spoon responses normally arrive in well under a second; a stalled request must
// not hold the serial chat queue or a dashboard render for minutes.
const API_TIMEOUT_MS = 10_000;

export function getMissingRequiredScopes(scope: string) {
  const grantedScopes = new Set(scope.split(/\s+/).filter(Boolean));
  return REQUIRED_SCOPES.filter((requiredScope) => !grantedScopes.has(requiredScope));
}

export type SpoonToken = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export type SpoonLive = {
  liveId: number;
  title: string;
  startedAt: string;
  closeAirTime: string;
  listenerCount: number;
  totalListenerCount: number;
  welcomeMessage: string;
  isChatFrozen: boolean;
  categories: string[];
  tags: string[];
};

export type SpoonListener = {
  id: string;
  nickname: string;
  // Added in Open API v1.2.0; null when the listener is not subscribed.
  subscription?: { plan: string } | null;
};

export type SpoonListenersPage = {
  listeners: SpoonListener[];
  nextCursor: string | null;
};

export type SpoonFan = SpoonListener & {
  rank: number;
  spoonCount: number | null;
};

export type SpoonDonation = {
  user: { id: string; nickname: string };
  stickerName: string;
  amount: number;
  time: string;
};

export type SpoonDonationsPage = {
  donations: SpoonDonation[];
  nextCursor: string | null;
};

export type SpoonFans = {
  totalCount: number;
  fans: SpoonFan[];
};

type SpoonOAuthError = {
  error?: string;
  error_description?: string;
};

export class SpoonOAuthErrorResponse extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "SpoonOAuthErrorResponse";
  }
}

export class SpoonApiErrorResponse extends Error {
  constructor(
    public readonly status: number,
    public readonly detailCode?: string,
    // Set on a daily-limit 429: wait this long (until Spoon's midnight reset).
    public readonly retryAfterMs?: number,
  ) {
    super(`Spoon API request failed with ${status}`);
    this.name = "SpoonApiErrorResponse";
  }
}

// Spoon sends Retry-After (seconds) only on the daily-limit 429; the per-second
// 429 has none and is handled with ordinary backoff.
export function parseRetryAfter(response: Response) {
  const seconds = Number(response.headers.get("retry-after"));
  return response.status === 429 && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

export function getSpoonConfig() {
  const clientId = process.env.SPOON_CLIENT_ID;
  const clientSecret = process.env.SPOON_CLIENT_SECRET;
  const redirectUri = process.env.SPOON_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("SPOON_CLIENT_ID and SPOON_REDIRECT_URI are required");
  }

  const configuredScopes = (process.env.SPOON_SCOPES || DEFAULT_SCOPES).split(/\s+/).filter(Boolean);

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: [...new Set([...REQUIRED_SCOPES, ...configuredScopes])].join(" "),
    baseUrl: process.env.SPOON_BASE_URL || DEFAULT_BASE_URL,
  };
}

let warnedAboutHostMismatch = false;

// In development, every redirect (including the OAuth return) goes to the host
// in SPOON_REDIRECT_URI. If the dev server ended up on another port (e.g. 3000
// was taken by another app), logins land on the wrong app; say so once.
function warnOnDevHostMismatch(fallbackUrl: string) {
  const configured = process.env.SPOON_REDIRECT_URI;
  if (process.env.NODE_ENV !== "development" || warnedAboutHostMismatch || !configured) return;
  try {
    const expectedHost = new URL(configured).host;
    const actualHost = new URL(fallbackUrl).host;
    if (expectedHost === actualHost) return;
    warnedAboutHostMismatch = true;
    console.warn(
      `[NAGU BOT] 이 개발 서버는 ${actualHost}에서 열렸지만 SPOON_REDIRECT_URI는 ${expectedHost}입니다. `
      + `로그인과 버튼 처리 후 ${expectedHost}로 이동하므로, 해당 포트를 비우고 다시 실행하거나 SPOON_REDIRECT_URI를 맞춰 주세요.`,
    );
  } catch {
    // An invalid URL is reported elsewhere (getSpoonConfig / OAuth errors).
  }
}

export function buildApplicationUrl(path: string, fallbackUrl: string) {
  warnOnDevHostMismatch(fallbackUrl);
  return new URL(path, process.env.SPOON_REDIRECT_URI || fallbackUrl);
}

export function buildAuthorizationUrl(state: string) {
  const config = getSpoonConfig();
  const url = new URL("https://developers.spooncast.net/kr/oauth/authorize");

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes);
  url.searchParams.set("state", state);

  return url;
}

function getClientAuthorization() {
  const config = getSpoonConfig();

  if (!config.clientSecret) {
    throw new Error("SPOON_CLIENT_SECRET is required");
  }

  return {
    config,
    basic: Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64"),
  };
}

async function requestToken(body: URLSearchParams): Promise<SpoonToken> {
  const { config, basic } = getClientAuthorization();
  const response = await fetch(`${config.baseUrl}/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as SpoonOAuthError;
    throw new SpoonOAuthErrorResponse(error.error || "token_request_failed", response.status);
  }

  return (await response.json()) as SpoonToken;
}

export function exchangeCode(code: string): Promise<SpoonToken> {
  const { redirectUri } = getSpoonConfig();
  return requestToken(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }));
}

export function refreshAccessToken(refreshToken: string): Promise<SpoonToken> {
  return requestToken(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }));
}

export async function revokeToken(token: string): Promise<void> {
  const { config, basic } = getClientAuthorization();
  const response = await fetch(`${config.baseUrl}/v1/oauth/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token }),
    cache: "no-store",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as SpoonOAuthError;
    throw new SpoonOAuthErrorResponse(error.error || "token_revoke_failed", response.status);
  }
}

export async function getCurrentLive(accessToken: string): Promise<SpoonLive | null> {
  const { baseUrl } = getSpoonConfig();
  const response = await fetch(`${baseUrl}/v1/live`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detailCode?: string };
    throw new SpoonApiErrorResponse(response.status, error.detailCode, parseRetryAfter(response));
  }

  return (await response.json()) as SpoonLive;
}

async function requestSpoonApi<T>(accessToken: string, path: string): Promise<T> {
  const { baseUrl } = getSpoonConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detailCode?: string };
    throw new SpoonApiErrorResponse(response.status, error.detailCode, parseRetryAfter(response));
  }

  return (await response.json()) as T;
}

export async function followCurrentDj(accessToken: string): Promise<void> {
  const { baseUrl } = getSpoonConfig();
  const response = await fetch(`${baseUrl}/v1/live/follow`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });

  if (response.status === 204) return;

  const error = (await response.json().catch(() => ({}))) as { detailCode?: string };
  throw new SpoonApiErrorResponse(response.status, error.detailCode, parseRetryAfter(response));
}

// The DJ's stable per-app identifier (same value as `user.id` on the DJ's chat
// events). Lets a fresh login find the DJ's saved data immediately.
export async function getMyUserId(accessToken: string) {
  const { userId } = await requestSpoonApi<{ userId: string }>(accessToken, "/v1/me");
  return userId;
}

export function getLiveListenersPage(accessToken: string, cursor?: string) {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return requestSpoonApi<SpoonListenersPage>(accessToken, `/v1/live/listeners${query}`);
}

// Donations of the current broadcast (Open API v1.2.0, donations.read). Used to
// recover donations the bot missed while disconnected; the stream never replays.
export function getLiveDonationsPage(accessToken: string, cursor?: string) {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return requestSpoonApi<SpoonDonationsPage>(accessToken, `/v1/live/donations${query}`);
}

export function getLiveFans(accessToken: string) {
  return requestSpoonApi<SpoonFans>(accessToken, "/v1/live/fans");
}