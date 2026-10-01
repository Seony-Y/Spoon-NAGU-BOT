const DEFAULT_BASE_URL = "https://kr-openapi.spooncast.net";
const DEFAULT_SCOPES = [
  "live.read",
  "events.chat",
  "events.presence",
  "events.like",
  "events.donation",
  "chat.send",
  "listeners.read",
  "fans.read",
].join(" ");

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
};

export type SpoonListenersPage = {
  listeners: SpoonListener[];
  nextCursor: string | null;
};

export type SpoonFan = SpoonListener & {
  rank: number;
  spoonCount: number | null;
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
  ) {
    super(`Spoon API request failed with ${status}`);
    this.name = "SpoonApiErrorResponse";
  }
}

export function getSpoonConfig() {
  const clientId = process.env.SPOON_CLIENT_ID;
  const clientSecret = process.env.SPOON_CLIENT_SECRET;
  const redirectUri = process.env.SPOON_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("SPOON_CLIENT_ID and SPOON_REDIRECT_URI are required");
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: process.env.SPOON_SCOPES || DEFAULT_SCOPES,
    baseUrl: process.env.SPOON_BASE_URL || DEFAULT_BASE_URL,
  };
}

export function buildApplicationUrl(path: string, fallbackUrl: string) {
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
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detailCode?: string };
    throw new SpoonApiErrorResponse(response.status, error.detailCode);
  }

  return (await response.json()) as SpoonLive;
}

async function requestSpoonApi<T>(accessToken: string, path: string): Promise<T> {
  const { baseUrl } = getSpoonConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { detailCode?: string };
    throw new SpoonApiErrorResponse(response.status, error.detailCode);
  }

  return (await response.json()) as T;
}

export function getLiveListenersPage(accessToken: string, cursor?: string) {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  return requestSpoonApi<SpoonListenersPage>(accessToken, `/v1/live/listeners${query}`);
}

export function getLiveFans(accessToken: string) {
  return requestSpoonApi<SpoonFans>(accessToken, "/v1/live/fans");
}