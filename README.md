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

The volume is required so OAuth sessions, settings, roulette data, game history, recent events, and rotated refresh tokens survive restarts. Railway defaults to `/data/nagu.db` when `SESSION_STORE_PATH` is omitted, but the `/data` volume must still be attached. Run a single service replica: SQLite is local to that volume, bot workers live in process memory, and Spoon allows one event stream per app and DJ. `/api/health` also queries SQLite, so point the Railway health check at it to catch a missing volume. Node.js 22.13 or newer is required for `node:sqlite`.

Persistent DJ workspace data survives browser refreshes, closing the window, broadcast endings, Railway process restarts and deployments, disconnecting, and reconnecting for a later broadcast — no manual backup is needed for day-to-day use.

### Identifying the DJ (`me.read`)

With the optional `me.read` scope (Open API v1.2.0), the OAuth callback calls `GET /v1/me` and links the session to the DJ's saved workspace immediately, so a new browser, a new device, or cleared cookies reach the same data at login. Without it, the link happens on the DJ's first chat while the bot is connected, and the dashboard shows a notice until then. Linking never merges or hands over a workspace that already belongs to another DJ (for example two DJs taking turns in one browser); such a login gets a fresh session instead.

### Several devices, one bot

A DJ can be logged in on several devices (for example the PC dashboard and the phone `/remote`). They share the DJ's workspace and a single bot: pressing **봇 입장** on one device takes the bot over from the DJ's other sessions instead of competing for Spoon's single event stream, live actions and dashboard chat from any device are sent through the session that runs the bot, and after a restart only the most recent enabled session per DJ is restored.

### Optional scopes

`me.read`, `events.follow`, `dj.follow`, and `donations.read` are requested only when listed in `SPOON_SCOPES`, because requesting a scope the app is not approved for in Spoon Developers blocks consent for every DJ. Enable them in Spoon Developers first, then add them to `SPOON_SCOPES`; DJs pick them up on their next login. Features turn on per DJ only when the scope was granted:

- `me.read` — immediate workspace linking at login (above)
- `events.follow` — **팔로우 감사**: thanks a listener's first follow in the broadcast (Spoon delivers only that one; the bot must be a manager). Toggle in 봇 운영 > 팔로우 감사, on `/remote`, or with `!팔로우 켜기|끄기`.
- `dj.follow` — **봇이 DJ 팔로우하기** button in 봇 운영 for the fixed-manager setup (`POST /v1/live/follow`; `OAPI_MNGR_0211` is shown as a rejected follow)
- `donations.read` — **후원 기록 복구**: whenever the stream (re)connects after a possible gap (start, restart/deploy, network drop, token renewal — not the periodic permission refresh), the bot reads `GET /v1/live/donations` for the current broadcast, records donations it missed, runs the roulette for them, and thanks those donors in one combined message. Donations are matched by donor and time (Spoon's documented key), so a donation seen both in the stream and the API counts once.

Listener lists show a 구독 badge for subscribed listeners (`subscription`, Open API v1.2.0), and the welcome message calls them "구독자" when the latest listener list shows the subscription (presence events themselves do not carry it).

## Bot participation

The dashboard's **봇 참여** button persists the desired participation state and opens Spoon's live event stream. If the DJ is offline, the worker waits and joins automatically when a broadcast starts. Temporary network failures reconnect with exponential backoff, and access tokens are refreshed once before reconnecting when the token is near expiry.

Spoon keeps one live-event-stream connection per app and DJ. If a second connection is opened, the previous stream closes with `event: end` and `reason: DUPLICATE_CONNECTION`. The worker that receives it stops and disables its participation instead of reconnecting, so two sessions for the same DJ never knock each other off; the dashboard shows "다른 곳에서 연결됨".

A simple reconnect does not replay prior join (`presence`) events. Join messages appear again only when Spoon emits new join events, such as:

- a listener actually re-enters and Spoon emits a new `presence` event
- the bot reconnects after manager-state changes that cause fresh presence delivery for this broadcast

For long-running resident bots, Spoon can emit `event: end` with `reason: TOKEN_EXPIRED` around one-hour token boundaries. The worker should refresh OAuth and reconnect immediately.

If the DJ marks or unmarks the bot as a manager during the broadcast, Spoon reflects that in a few seconds without requiring a manual leave/join.

**봇 퇴장** closes the event stream and disables restart restoration. Spoon may keep the listener presence visible for a short time after the stream closes.

Enabled bots reconnect when the Railway process restarts or an authenticated dashboard request reaches a new server process. The enabled state, current broadcast ID, tokens, current-broadcast activity, and 50 most recent bot events are stored in SQLite and restored after a restart.

The top-level **데이터 백업** tab downloads a signed JSON backup containing the DJ display name, automation messages/toggles/interval, commands, counters, song requests, rock-paper-scissors, raffle and quiz rounds/entries, the quiz queue, and roulette settings/items/results/keeps. The optional full download also contains listener profiles, presence/heart/donation events, and live Spoon-ranking snapshots. OAuth tokens, session cookies, admin state, bot participation/current-live state, and transient recent events are never exported. Restoring replaces core workspace data after signature and schema validation; a core-only restore preserves existing audience tables. Uploads are limited to 10 MB.

## Chat

With the `chat.send` scope, the dashboard can send messages of up to 200 UTF-16 code units to the current broadcast. A `401` refreshes the access token once; missing permission, frozen chat, bot blocking, offline broadcasts, and rate limiting are shown separately.

While the bot event stream is connected, these built-in commands reply automatically through the same serialized send queue:

- `!안녕` — greet the listener by nickname
- `!명령어` — list the commands and named counters currently available, including live dashboard updates
- `!가위바위보 가위|바위|보` — join the active DJ rock-paper-scissors round once; results are revealed when the DJ ends the round
- `!참여` — join the active raffle once per account; winner counts range from 1 to 100,000
- `!정답 정답내용` — submit or replace an answer for the active quiz; correct submissions remain private until the DJ ends the quiz
- `!신청곡 곡명-가수` — add a song request for any listener
- `!신청곡 목록` — list every queued song request for any listener
- `!신청곡 삭제 번호` — remove a numbered song request for the DJ only

## DJ chat control

DJs broadcast from inside Spoon's monitoring screen, so every live action can also be run by typing in the broadcast chat from the DJ account — no second screen needed. These commands are DJ-only (non-DJ messages fall through to the listener commands) and call the same action layer (`src/lib/live-actions.ts`) as the dashboard buttons:

- `!봇` — list the DJ commands; `!봇 상태` — active games, queued quizzes, and roulette/automation switches
- `!가위바위보 시작` / `!가위바위보 종료` — the DJ choice is picked at random, since typing it in public chat would reveal it
- `!추첨 시작 [인원]` / `!추첨 종료` — winner count defaults to 1
- `!퀴즈 시작` / `!퀴즈 종료` — starts the next question from the quiz queue; register questions and answers in Game > 퀴즈 before the broadcast so answers never appear in chat
- `!룰렛 켜기|끄기`, and `!환영`, `!후원`, `!하트`, `!팔로우`, `!공지` with `켜기|끄기` for 입장 환영, 후원 감사, 하트 감사, 팔로우 감사, and 반복 공지

For DJs broadcasting from a PC, `/remote` is a phone-sized controller with the same actions as large buttons: start/finish games, adjust counters (announced in chat), and flip the roulette and automation switches. It refreshes every 3 seconds and shows the active quiz answer only on screen.

Bot messages are sent with the DJ's token, so DJ chat that exactly matches a message the bot sent in the last 30 seconds is ignored to prevent self-triggered commands.

The Game dashboard retains rock-paper-scissors, raffle, and quiz rounds by DJ workspace and shows the 10 most recent completed rounds. Quiz history includes each listener's latest submission, the first correct listener, elapsed time, and every correct listener. Quiz results are announced through bot chat only when the DJ presses the finish button.

## Audience and automation

With `listeners.read`, the dashboard follows every `nextCursor` and shows the current listener snapshot. With `fans.read`, it shows the current broadcast's top 30 fan ranking. These APIs can include the bot account itself.

While participating, the bot also:

- greets each listener ID once per broadcast (`events.presence`)
- thanks each donation and totals the received spoons (`events.donation`)
- totals `like.totalAmount` and thanks each listener with the heart message (`events.like`); consecutive hearts from the same listener within 3 seconds are merged into one thank-you (flushed after at most 10 seconds of continuous tapping), while different listeners are always thanked separately

Spoon only sends presence events after the DJ makes the bot a manager. Until those events are confirmed, the worker refreshes its event stream every minute, so a manager promotion made during a broadcast is picked up automatically without a manual bot leave/join. Automation totals reset when the broadcast ends; they are restored from SQLite after a process restart during the same broadcast, and repeat announcements resume.

Recommended manager setup order for fixed manager assignment:

1. While live, ensure the bot account can participate normally in the broadcast.
2. After the broadcast ends, assign the bot as a fixed manager in Spoon.

Before manager-only presence events are confirmed, a custom chat command receives a manager setup notice instead of running. Counters, the command list, and song requests remain available to their documented roles.

Spoon does not expose the DJ's nickname (even `GET /v1/me` returns only `userId`). Message templates use `DJ` until the connected DJ sends a chat event, then the bot learns and stores that nickname automatically; a template's `DJ {name}` collapses to `DJ` meanwhile so messages never read "DJ DJ".

The **봇 운영** tab provides welcome messages, donation thanks, heart donations, repeat announcements, named counters, chat commands, and the song-request queue. Repeat announcements default to 10 minutes, accept a 1-1440 minute interval, and pick up changes within one minute. Spoon's own `welcomeMessage` remains read-only because the Open API does not provide an update endpoint.

Named counters support multiple independent values such as `실드`, `펀딩`, or `이벤트`. Every DJ starts with `!실드` at 0. Anyone can use `!실드` to display the current value, while only the DJ can use `!실드 +2` or `!실드 -1` to change it. Values never become negative. The same permission rule applies to every named counter. Names, initial values, current values, resets, and deletions are managed in the counter tab.

Disconnecting revokes the DJ's Spoon token (signing out all of that DJ's devices, which share it) but keeps the opaque browser session and local workspace link. Reconnecting from the same browser restores that DJ's automation messages, commands, counters, song requests, current broadcast context, and enabled bot state without waiting for a DJ chat event. After clearing the browser cookie, the workspace is relinked at login with `me.read`, or otherwise on the DJ's next chat event.

## Token refresh timing

Use proactive refresh with a margin of 5 minutes before access-token expiry.

## Error codes

- `OAPI_MNGR_0211` is handled as a Spoon manager/follow-flow error and should be surfaced in operator guidance when follow/manager prerequisites are not met.

## Administration

Open `/admin` and enter `ADMIN_PASSWORD` to block or unblock an OAuth connection. The code is held only in page memory: no admin cookie or session is created, and refreshing or reopening `/admin` requires the code again. Blocking immediately stops its running event worker, disables restart restoration, and rejects authentication, bot participation, chat, settings changes, and OAuth reconnection for that same connection.

The Spoon Open API does not expose a stable DJ account identifier. Blocking therefore applies to the stored OAuth connection, and a DJ who clears the session cookie and grants a completely new OAuth connection can appear as a new record.

## Errors and resilience

- **Half-open streams:** Spoon sends a heartbeat about every 15 seconds; 45 seconds without any data reconnects the stream instead of showing "connected" while deaf.
- **Busy chat:** Spoon's chat limit is shared by the whole room. A rate-limited bot message is retried after 1 and 2 seconds instead of being dropped.
- **Chat flooding:** successful game entries (가위바위보 participation, 추첨 응모, 퀴즈 답) are acknowledged in one message per game every few seconds ("[추첨] 응모 완료! A님, B님 …"), and pending acknowledgements are sent before a game's results. Error replies (already entered, nothing running) stay immediate.
- **One token set per DJ:** following Spoon's token guidance, a DJ's sessions share one token pair. A login hands its token to the DJ's other devices and revokes the tokens they held; a refresh (refresh tokens rotate) is stored for all of them and runs once at a time per DJ. Consequently **연결 해제 signs out every device of that DJ**. A re-consent that misses a required scope only discards the new token and leaves the existing login alone.
- **Daily API limit:** a 429 with `Retry-After` is Spoon's daily limit. Chat reports it as `daily_limited` without retrying, and the bot pauses live checks and listener polling until the reset (re-checking at most hourly). The per-second 429 keeps ordinary backoff.
- **Shutdown:** on SIGTERM/SIGINT the bot queues pending heart thanks and game acknowledgements, closes its streams, and checkpoints SQLite. Next exits right after, so this is best effort; bots stay enabled and the next process restores them.
- **Malformed requests:** POST routes treat an unparseable body as an empty form and answer with their normal invalid-input result instead of a 500.


All Spoon API calls time out after 10 seconds (chat sends after 8) so a stalled request cannot hold the serial chat queue or a dashboard render. Unexpected server errors show a Korean error page with a retry button, and the bot keeps running. A stored token that can no longer be decrypted (for example after a `SESSION_SECRET` change) marks that login for reconnect instead of deleting the session and its data link. The dashboard calls Spoon's live and audience APIs only on the main tab, keeping the frequently auto-refreshed game and remote views cheap.

## Code layout

- `src/lib/live-actions.ts` — live actions (games, switches, counters) shared by the dashboard routes, DJ chat commands, and `/remote`
- `src/lib/dj-command.ts` — DJ chat command parser
- `src/lib/store/*` — SQLite persistence split by domain (`db`, `sessions`, `settings`, `workspace`, `audience`, `roulette`, `games`); import it through `src/lib/session-store.ts`

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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. `npm run dev` is pinned to port 3000 because `SPOON_REDIRECT_URI` (and every app redirect) points there; if the port is taken the server fails instead of silently moving to 3001, and a console warning appears whenever the request host and `SPOON_REDIRECT_URI` differ in development. Keep real secrets out of `.env.local` placeholders: values there override `.env`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
