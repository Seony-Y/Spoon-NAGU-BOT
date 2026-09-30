# NAGU BOT

Spoon OAuth and bot management server for Railway.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the Spoon Client Secret after the app is approved.
3. Generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
4. Run `npm run dev`.

The registered redirect URI must exactly match `SPOON_REDIRECT_URI`.

## Vercel environment variables

Configure every variable from `.env.example`. Use the production deployment URL for `SPOON_REDIRECT_URI`, for example:

```text
https://nagu-bot.vercel.app/oauth/callback
```

Tokens are encrypted with AES-256-GCM in SQLite. The browser only receives an opaque, HttpOnly, Secure, SameSite=Lax session ID. The application does not print tokens to the page or server logs.

## Railway persistence

Attach a Railway volume and mount it at `/data`, then set:

```text
SESSION_STORE_PATH=/data/nagu.db
```

The volume is required so OAuth sessions and rotated refresh tokens survive restarts. Run a single service replica because SQLite is local to that volume.

## Bot participation

The dashboard's **봇 참여** button persists the desired participation state and opens Spoon's live event stream. If the DJ is offline, the worker waits and joins automatically when a broadcast starts. Temporary network failures reconnect with exponential backoff, and expired access tokens are refreshed once before reconnecting.

**봇 퇴장** closes the event stream and disables restart restoration. Spoon may keep the listener presence visible for a short time after the stream closes.

Enabled bots reconnect when the Railway process restarts. The enabled state and tokens are stored in SQLite; the recent event list is held in process memory and starts empty after a restart.

## Chat

With the `chat.send` scope, the dashboard can send messages of up to 200 UTF-16 code units to the current broadcast. A `401` refreshes the access token once; missing permission, frozen chat, bot blocking, offline broadcasts, and rate limiting are shown separately.

While the bot event stream is connected, these built-in commands reply automatically through the same serialized send queue:

- `!안녕` — greet the listener by nickname
- `!명령어` — list the available commands

## Validation

```bash
npm test
npm run lint
npm run build
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
