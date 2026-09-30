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

type SpoonOAuthError = {
  error?: string;
  error_description?: string;
};

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

export async function exchangeCode(code: string): Promise<SpoonToken> {
  const config = getSpoonConfig();

  if (!config.clientSecret) {
    throw new Error("SPOON_CLIENT_SECRET is required");
  }

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(`${config.baseUrl}/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as SpoonOAuthError;
    throw new Error(error.error || `Token exchange failed with ${response.status}`);
  }

  return (await response.json()) as SpoonToken;
}