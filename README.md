# NAGU BOT

Spoon OAuth and bot management server for Railway.

DJs sign in with the Spoon account they use for broadcasting and approve the requested broadcast and chat permissions. NAGU BOT does not maintain a separate user account or store Spoon passwords.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the Spoon Client Secret after the app is approved.
3. Generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
4. Set a strong `ADMIN_PASSWORD` for the `/admin` operations page.
5. Set a strong `ACCESS_CODE`. DJs must verify this code before the Spoon OAuth login button is enabled.
6. Run `npm run dev`.

The registered redirect URI must exactly match `SPOON_REDIRECT_URI`. The application must also be approved and show an `active` status in Spoon Developers before OAuth consent works. If every scope shows "이 앱과 연결할 수 없습니다", confirm that the configured Client ID belongs to the active app rather than a pending, rejected, deleted, or different application.

## Vercel environment variables

Configure every variable from `.env.example`. Use the production deployment URL for `SPOON_REDIRECT_URI`, for example:

```text
https://nagu-bot.vercel.app/oauth/callback
```

Tokens are encrypted with AES-256-GCM in SQLite. The browser only receives an opaque, HttpOnly, Secure, SameSite=Lax session ID. The application does not print tokens to the page or server logs.

The OAuth connect route also requires a short-lived, HttpOnly proof issued after the shared `ACCESS_CODE` is verified. Opening `/oauth/connect` directly without that proof returns to the login page and does not start Spoon authorization.

## Railway persistence

Attach a Railway volume and mount it at `/data`, then set:

```text
SESSION_STORE_PATH=/data/nagu.db
```

The volume is required so OAuth sessions, settings, roulette data, game history, recent events, and rotated refresh tokens survive restarts. Railway defaults to `/data/nagu.db` when `SESSION_STORE_PATH` is omitted, but the `/data` volume must still be attached. Run a single service replica because SQLite is local to that volume.

Persistent DJ workspace data survives browser refreshes, broadcast endings, Railway process restarts and deployments, and reconnecting for a later broadcast. If OAuth is restarted without the existing browser session, the bot links the stored workspace again when the DJ next sends a chat event because Spoon OAuth tokens do not expose the DJ user ID.

## Bot participation

The dashboard's **봇 참여** button persists the desired participation state and opens Spoon's live event stream. If the DJ is offline, the worker waits and joins automatically when a broadcast starts. Temporary network failures reconnect with exponential backoff, and expired access tokens are refreshed once before reconnecting.

**봇 퇴장** closes the event stream and disables restart restoration. Spoon may keep the listener presence visible for a short time after the stream closes.

Enabled bots reconnect when the Railway process restarts. The enabled state, tokens, and 50 most recent bot events are stored in SQLite and restored after a restart.

## Chat

With the `chat.send` scope, the dashboard can send messages of up to 200 UTF-16 code units to the current broadcast. A `401` refreshes the access token once; missing permission, frozen chat, bot blocking, offline broadcasts, and rate limiting are shown separately.

While the bot event stream is connected, these built-in commands reply automatically through the same serialized send queue:

- `!안녕` — greet the listener by nickname
- `!명령어` — list the commands and named counters currently available, including live dashboard updates
- `!하트랭킹` — show up to 10 listeners ranked by hearts in the current broadcast
- `!애청온도랭킹` — show up to 10 listeners ranked by favorite temperature in the current broadcast
- `!스푼랭킹` — show up to 10 listeners ranked by donations without exposing Spoon totals
- `!내정보` — show the listener's heart, favorite-temperature, and Spoon ranks without exposing their Spoon total
- `!가위바위보 가위|바위|보` — join the active DJ rock-paper-scissors round once; results are revealed when the DJ ends the round
- `!신청곡 곡명-가수` — add a song request for any listener
- `!신청곡 목록` — list every queued song request for any listener
- `!신청곡 삭제 번호` — remove a numbered song request for the DJ only

The Game dashboard retains rock-paper-scissors rounds by DJ workspace and shows the 10 most recent completed rounds. Each expandable record includes the DJ choice, participant count, win/draw/loss totals, and participant results.

## Audience and automation

With `listeners.read`, the dashboard follows every `nextCursor` and shows the current listener snapshot. With `fans.read`, it shows the current broadcast's top 30 fan ranking. These APIs can include the bot account itself.

While participating, the bot also:

- greets each listener ID once per broadcast (`events.presence`)
- thanks each donation and totals the received spoons (`events.donation`)
- totals `like.totalAmount` and announces each new 100-heart milestone (`events.like`)

Spoon only sends presence events after the DJ makes the bot a manager. Until those events are confirmed, the worker refreshes its event stream every minute, so a manager promotion made during a broadcast is picked up automatically without a manual bot leave/join. Automation totals are held in process memory and reset when the broadcast ends or the process restarts.

Before manager-only presence events are confirmed, a custom chat command receives a manager setup notice instead of running. Counters, the command list, and song requests remain available to their documented roles.

Spoon does not expose a profile endpoint or nickname in the OAuth token. Message templates use `DJ` until the connected DJ sends a chat event, then the bot learns and stores that nickname automatically.

The **봇 운영** tab provides current-broadcast, daily (Asia/Seoul), and all-time listener rankings for donated spoons, hearts, and favorite temperature. Rankings are accumulated by Spoon user ID, while the latest nickname is kept for display. SSE event IDs prevent duplicate totals after reconnects. The same tab also provides welcome messages, donation thanks, heart donations, repeat announcements, named counters, chat commands, and the song-request queue. Repeat announcements default to 10 minutes, accept a 1-1440 minute interval, and pick up changes within one minute. Spoon's own `welcomeMessage` remains read-only because the Open API does not provide an update endpoint.

Named counters support multiple independent values such as `실드`, `펀딩`, or `이벤트`. Every DJ starts with `!실드` at 0. Anyone can use `!실드` to display the current value, while only the DJ can use `!실드 +2` or `!실드 -1` to change it. Values never become negative. The same permission rule applies to every named counter. Names, initial values, current values, resets, and deletions are managed in the counter tab.

Disconnecting revokes OAuth credentials and removes only the local authentication session. When the DJ chats after reconnecting, the stable Spoon user ID restores that DJ's latest automation messages, commands, counters, song requests, and accumulated rankings from the persistent workspace.

## Administration

Open `/admin` and enter `ADMIN_PASSWORD` to block or unblock an OAuth connection. The code is held only in page memory: no admin cookie or session is created, and refreshing or reopening `/admin` requires the code again. Blocking immediately stops its running event worker, disables restart restoration, and rejects authentication, bot participation, chat, settings changes, and OAuth reconnection for that same connection.

The Spoon Open API does not expose a stable DJ account identifier. Blocking therefore applies to the stored OAuth connection, and a DJ who clears the session cookie and grants a completely new OAuth connection can appear as a new record.

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
