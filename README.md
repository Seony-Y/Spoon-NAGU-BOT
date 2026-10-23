# NAGU BOT

Spoon (Korean audio streaming) DJ bot and dashboard, deployed on Railway.

DJs sign in with the Spoon account they broadcast from and approve the requested permissions. NAGU BOT keeps no separate user account and never sees Spoon passwords. While a DJ is live, the bot greets listeners, thanks donations, hearts, and follows, runs chat games and a donation roulette, and answers chat commands. DJs control everything from the dashboard, from a phone-sized remote (`/remote`), or by typing DJ-only commands in their own broadcast chat, so they never have to leave Spoon's monitoring screen.

## Local development

1. Copy `.env.example` to `.env.local` and fill in real values. `.env.local` overrides `.env`, so a leftover placeholder such as `SESSION_SECRET=SESSION_SECRET` silently breaks login: remove any line you do not mean to override.
2. Generate a session secret (32+ characters) with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
3. Set `ACCESS_CODE` (DJs must enter it before the Spoon login button is enabled) and `ADMIN_PASSWORD` (for `/admin`).
4. Run `npm run dev` and open <http://localhost:3000>.

`npm run dev` is pinned to port 3000 because `SPOON_REDIRECT_URI` and every app redirect point there. If the port is taken the server fails instead of moving to 3001; in development a console warning also appears whenever the request host and `SPOON_REDIRECT_URI` differ.

**Spoon login locally:** Spoon Developers accepts a single login redirect URL per app, and the redirect must exactly match `SPOON_REDIRECT_URI`. With the production URL registered, a login started on `localhost` cannot complete (Spoon rejects it with "이 앱과 연결할 수 없습니다", or returns to production where the login state is missing). To test login locally, register a separate development app with `http://localhost:3000/oauth/callback` and put its Client ID and secret in `.env.local`; Railway keeps the production app's values.

Validation:

```bash
npm test
npm run lint
npm run build
npm run test:e2e   # after build: CRUD over HTTP on a throwaway database
```

GitHub Actions (`.github/workflows/ci.yml`) runs all four on every push to `main` and every pull request. The e2e run uses throwaway secrets and an unreachable Spoon base URL, so it never touches real accounts.

## Deployment (Railway)

- Configure every variable from `.env.example` in Railway. `SPOON_REDIRECT_URI` is the production callback, e.g. `https://spoon-nagu-bot-production.up.railway.app/oauth/callback`, and must match the URL registered in Spoon Developers.
- Attach a volume at `/data` and set `SESSION_STORE_PATH=/data/nagu.db` (the default on Railway). Sessions, settings, game history, roulette data, audience events, and rotated refresh tokens live in this SQLite file.
- Run a **single replica**: SQLite is local to the volume, bot workers live in process memory, and Spoon allows one event stream per app and DJ.
- Point the health check at `/api/health`; it queries SQLite, so a missing volume fails it.
- Node.js 22.13 or newer is required (`node:sqlite`).

### Staging

Spoon Developers accepts one login redirect URL per app, so each environment that DJs log into needs its own Spoon app:

| Environment | Spoon app | `SPOON_REDIRECT_URI` |
|---|---|---|
| Production (Railway) | production app | production URL |
| Staging (Railway environment) | development app | the staging URL |
| Local | development app (switch its URL when needed) or a third app | `http://localhost:3000/oauth/callback` |

Create the staging environment in Railway with its **own volume**, its own `SESSION_SECRET`, `ACCESS_CODE`, and `ADMIN_PASSWORD`, and `APP_ENV_LABEL=스테이징` so every page shows a staging badge. Deploy a branch there first, run the post-deploy checklist, then merge to `main`.

### Operations settings

| Variable | Default | Purpose |
|---|---|---|
| `ALERT_WEBHOOK_URL` | unset | Discord/Slack webhook for operator alerts: bot worker stopped, 5 failed reconnects in a row, Spoon daily API or chat limit, token decryption failure (check `SESSION_SECRET`), bot restore failure, backup or cleanup failure. Each kind is sent at most once per 30 minutes. |
| `APP_ENV_LABEL` | unset | Badge text shown in the header and remote (e.g. `스테이징`, `로컬`) |
| `DB_BACKUP_DISABLED` | unset | `1` turns off the daily backup |
| `DB_BACKUP_KEEP` | `7` | Daily backup files to keep |
| `SESSION_RETENTION_DAYS` | `30` | Signed-out sessions older than this are deleted |
| `ROULETTE_RESULT_RETENTION_DAYS` | `365` | Older roulette results are deleted (keeps are kept) |
| `AUDIENCE_EVENT_RETENTION_DAYS` | `180` | Audience events of broadcasts older than this are folded into per-listener totals |

### Daily maintenance and restoring a backup

About a minute after boot and then hourly, the app checks whether today's tasks ran:

- **Backup:** `VACUUM INTO` writes `backups/nagu-YYYY-MM-DD.db` next to the database (`/data/backups` on Railway), first under a `.partial` name, and keeps the newest `DB_BACKUP_KEEP` files. `/api/health` reports `lastBackup`.
- **Cleanup:** deletes stale signed-out sessions and old roulette results, and compacts old audience events into `audience_archive` so all-time listener totals stay the same.

To restore: stop the service, replace `/data/nagu.db` with the chosen `backups/nagu-YYYY-MM-DD.db`, delete `/data/nagu.db-wal` and `/data/nagu.db-shm`, and start the service. For a single DJ, the in-app signed JSON backup (데이터 백업 tab) is usually the better tool.

## Spoon OAuth and permissions

Required scopes: `live.read events.chat events.presence events.like events.donation chat.send listeners.read fans.read`. A login that grants fewer is discarded (the new token is revoked) while any existing login stays signed in.

Optional scopes are requested only when listed in `SPOON_SCOPES`, because requesting a scope the app is not approved for blocks consent for every DJ. Approve them in Spoon Developers first, then add them to `SPOON_SCOPES` (locally and in Railway); DJs pick them up on their next login. Each feature turns on per DJ only when the scope was granted:

| Scope | Feature |
|---|---|
| `me.read` | `GET /v1/me` at login links a new browser or device to the DJ's saved data immediately |
| `events.follow` | **팔로우 감사**: thanks a listener's first follow in the broadcast (bot must be a manager) |
| `dj.follow` | **봇이 DJ 팔로우하기** button for the fixed-manager setup (`POST /v1/live/follow`) |
| `donations.read` | **후원 기록 복구**: recovers donations made while the bot was disconnected |

The login button works only after the shared `ACCESS_CODE` is verified: `/oauth/access` issues a short-lived HttpOnly proof (a signed timestamp, valid 10 minutes) that `/oauth/connect` checks. Wrong codes are rate limited per client and globally. The OAuth `state` cookie also lasts 10 minutes; a callback without it (login started on another host, or too slow) shows a dedicated `state_missing` message.

## Data persistence and identity

Workspace data (settings, commands, counters, song requests, game history, quiz queue, roulette, audience events) survives refreshes, closed windows, broadcast endings, restarts and deploys, disconnecting, and later broadcasts. Manual backup is not needed day to day.

- **Linking a session to the DJ:** with `me.read` this happens at login. Without it, it happens on the DJ's first chat while the bot is connected, and the dashboard shows a notice until then. A workspace that already belongs to another DJ (two DJs taking turns in one browser) is never merged or handed over; that login gets a fresh session.
- **Several devices, one bot:** a DJ's sessions share the workspace and a single bot. Pressing **봇 입장** on one device takes the bot over from the DJ's other sessions; live actions and dashboard chat from any device go through the session that runs the bot. After a restart only the most recent enabled session per DJ is restored.
- **One token set per DJ** (Spoon's guidance): a login hands its token to the DJ's other sessions and revokes the tokens they held; a refresh (refresh tokens rotate) is stored for all of them and runs once at a time per DJ. Therefore **연결 해제 signs out every device of that DJ**, while keeping the saved data and the browser's workspace link.
- Tokens are encrypted with AES-256-GCM. The browser only holds an opaque HttpOnly session ID. A token that can no longer be decrypted (for example after a `SESSION_SECRET` change) marks that login for reconnect instead of deleting the session and its data link.
- Spoon never exposes the DJ's nickname (`/v1/me` returns only `userId`). Templates show `DJ` until the DJ chats once; `DJ {name}` collapses to `DJ` meanwhile so messages never read "DJ DJ".

## Bot runtime

- **봇 입장** stores the desired state and opens `GET /v1/live/events`. Offline, the worker waits and joins when a broadcast starts. Network failures reconnect with exponential backoff (1 s to 30 s with jitter); tokens are refreshed 5 minutes before expiry.
- Stream `end` reasons: `TOKEN_EXPIRED` refreshes and reconnects immediately (normal about hourly), `RECONNECT` reconnects with the same token, `LIVE_ENDED` waits for the next broadcast, `DUPLICATE_CONNECTION` stops that worker and shows "다른 곳에서 연결됨".
- Spoon sends a heartbeat about every 15 seconds; 45 seconds of silence reconnects a half-open stream.
- `presence` and `follow` events arrive only while the bot is a manager. Until presence is confirmed the stream is refreshed every minute, so a manager promotion during a broadcast is picked up without leave/join.
- Enabled bots, the current broadcast, automation totals, greeted listeners, and the 50 most recent events are restored after a restart. Repeat announcements resume.
- With `donations.read`, every (re)connect after a possible gap reads `GET /v1/live/donations`, records missed donations, runs the roulette for them, and thanks those donors in one message. Donations are matched by donor and time (Spoon's documented key), so one seen in both the stream and the API counts once.
- On SIGTERM/SIGINT pending heart thanks and game acknowledgements are queued, streams close, and SQLite is checkpointed. Next exits right after, so this is best effort; bots stay enabled and are restored.
- **봇 퇴장** closes the stream and disables restoration.

## Chat

Bot messages go through one serial queue per DJ (200 UTF-16 code units, truncated without splitting emoji). A `401` refreshes the token once. A rate-limited message (Spoon's chat limit is shared by the whole room) is retried after 1 and 2 seconds; a 429 with `Retry-After` is the daily limit and is reported as `daily_limited` without retrying. Bot messages are sent with the DJ's token, so DJ chat identical to a bot message from the last 30 seconds is ignored to prevent self-triggered commands. Unknown `!` messages get no reply.

Listener commands:

- `!명령어` — commands and counters available now
- `!안녕` — greeting
- `!실드` (and every named counter) — show the value; `!실드 +2` / `!실드 -1` change it (DJ only, never below 0)
- `!신청곡 곡명-가수`, `!신청곡 목록`; `!신청곡 삭제 번호` (DJ only)
- `!가위바위보 가위·바위·보`, `!참여` (raffle), `!정답 (답)` (quiz), `!팀 (번호|이름)` (team battle, once per battle)
- `!출석` — own attendance count and streak; `!출석왕` — this month's top 5
- `!내 킵`; `!킵 삭제 닉네임 / 경품 이름 / 수량` (DJ only)

Successful game entries are acknowledged in one message per game every few seconds ("[추첨] 응모 완료! A님, B님 …"), and pending acknowledgements are sent before that game's results. Error replies stay immediate.

## DJ chat control and remote

DJ-only commands (other users' messages fall through to the listener commands) call the same action layer as the dashboard:

- `!봇` — command list; `!봇 상태` — active games, queued quizzes, roulette and automation switches
- `!가위바위보 시작` / `종료` — the DJ choice is random, since typing it in public chat would reveal it
- `!추첨 시작 [인원]` / `종료` — winner count 1 to 100,000, default 1
- `!퀴즈 시작` / `종료` — starts the next question from the quiz queue, so answers never appear in chat
- `!비밀단어 시작` / `힌트` / `종료` — starts the next queued secret word (only its letter count is announced); `힌트` reveals the hint
- `!팀전 시작` / `상태` / `종료` — uses the team settings saved in the dashboard
- `!룰렛`, `!환영`, `!후원`, `!하트`, `!팔로우`, `!공지` + `켜기` / `끄기`

`/remote` is a phone-sized controller for DJs broadcasting from a PC: start and finish games (including the secret word, with its hint, and the team battle with live scores), set counters by typing the new value (announced in chat like `!실드 +N`), and flip the roulette and automation switches. It refreshes every 3 seconds and shows the active quiz answer and secret word only on screen.

## Automation

- **입장 환영** — once per listener per broadcast, with a title for the top fan, managers, subscribers (from the latest listener list, since presence events do not carry it), or regulars (`favoriteTemperature` ≥ 36.5)
- **후원 감사** — every donation; spoons are totaled
- **하트 감사** — hearts from the same listener within 3 seconds are merged into one thank-you (flushed after at most 10 seconds of continuous tapping); different listeners are never merged
- **팔로우 감사** — a listener's first follow in the broadcast (`events.follow`)
- **반복 공지** — every 1 to 1440 minutes (default 10); changes apply within a minute

Switches apply immediately; message edits apply on save. Spoon's own `welcomeMessage` is read-only in the Open API.

## Games

Games start only while the bot is in a live broadcast (`not_live` otherwise), since the start announcement would be lost and a queued question or word used up. A secret word or team battle still open when the broadcast ends is closed automatically and its result recorded (chat is gone, so it is not announced), so the next broadcast starts clean.

Rock-paper-scissors, raffle, and quiz rounds are kept per workspace; the dashboard shows the 10 most recent completed rounds. Quiz questions can be queued before a broadcast (Enter queues; **지금 바로 출제** publishes immediately). A listener who answered correctly once stays correct even after resubmitting (intended). Quiz results announce the answer, the first solver(s) with elapsed time, and the other solvers.

**비밀 단어** — the DJ queues words (and optional hints) before a broadcast; while a round is active, the first listener whose chat contains the word (spaces, punctuation and case ignored; the DJ's own chat never counts) wins and the bot announces it with the elapsed time. Matching chat is still processed as usual.

**팀 대항전** — 2 to 4 teams, scored by hearts, spoons, or both (1 spoon = 10 points), with an optional goal. Listeners join with `!팀` once; only hearts and donations sent after joining count (recovered donations included, replayed events excluded). Lead changes are announced at most once a minute (a lead that still holds after the minute is announced on the next point), the first team to reach the goal wins automatically, and the result names the MVP.

**출석** — a listener who enters (presence event, or the listener list when the bot gets no presence events), chats, sends hearts or donations, or follows while the bot is in the broadcast attends that broadcast once (the DJ is excluded). Streaks count the DJ's broadcasts rather than calendar days. Milestones (total 10/30/50/100/200/300/500/1000, streak 5/10/20/30/50/100) are congratulated in chat unless turned off on the dashboard, which also shows the monthly and all-time ranking.

The roulette runs once per donation at or above the configured cost, with prize percentages in 0.01% steps and the remainder as 꽝. Prizes go to per-listener keeps, deduplicated per donation.

## Backups

The **데이터 백업** tab downloads a signed JSON backup of the DJ display name, automation settings (including follow thanks), commands, counters, song requests, game rounds and entries, the quiz queue, secret words, team battles, the attendance switch and broadcast list, and roulette settings, prizes, results, and keeps. The full download adds listener profiles, presence/heart/donation events, Spoon-ranking snapshots, and attendance records. Tokens, session cookies, admin state, bot participation, and recent events are never exported. Restoring replaces core workspace data after signature and schema validation; older backups without newer tables still restore. Uploads are limited to 10 MB.

## Administration

`/admin` (with `ADMIN_PASSWORD`, rate limited) lists OAuth connections with the DJ they belong to and can block or unblock them. Nothing is stored in the browser; reopening the page asks for the password again. When the DJ is known, blocking applies to **every session of that DJ and to future logins** (rejected at the OAuth callback via `/v1/me`, or when a DJ chat links a new session); a connection whose DJ is not known yet is blocked on its own. Blocking stops the affected workers and rejects login, bot participation, chat, and settings changes.

## Errors and resilience

- Spoon API calls time out after 10 seconds (chat sends after 8). Spoon's daily-limit 429 (`Retry-After`) pauses live checks and listener polling until the reset, re-checking at most hourly.
- Unexpected server errors show a Korean error page with a retry button; the bot keeps running.
- The dashboard calls Spoon's live and audience APIs only on the main tab, keeping the auto-refreshed game and remote views cheap.
- POST routes treat an unparseable body as an empty form and return their normal invalid-input result.
- `OAPI_MNGR_0209` (bot blocked from the broadcast) stops the worker; `OAPI_MNGR_0211` (bot cannot follow the DJ, the DJ may have blocked it) is shown on the follow button.
- Destructive dashboard actions (deleting, clearing song requests, restoring a backup, disconnecting, 봇 퇴장) ask for confirmation.

## Code layout

- `src/lib/live-actions.ts` — live actions (games, switches, counters) shared by dashboard routes, DJ chat commands, and `/remote`
- `src/lib/dj-command.ts` — DJ chat command parser
- `src/lib/bot-runtime.ts` — per-DJ event-stream worker; `src/lib/chat.ts` and `src/lib/chat-acks.ts` — send queue and batched acknowledgements
- `src/lib/store/*` — SQLite persistence by domain (`db`, `sessions`, `settings`, `workspace`, `audience`, `roulette`, `games`, `maintenance`), imported through `src/lib/session-store.ts`
- `src/lib/maintenance.ts` — daily backup and cleanup; `src/lib/alerts.ts` — webhook alerts
- `src/app/page.tsx` — dashboard shell (header, login card, bot bar, tabs). Data comes from `src/app/dashboard/load.ts` (`loadDashboardView`, typed as `DashboardView`); each tab section is a server component in `src/app/dashboard/` (`live-card`, `audience-card`, `recent-events-card`, `game-card` with `rps`/`raffle`/`quiz`/`roulette` panels, `bot-card` with `automation-settings`, `backup-card`); notice texts live in `labels.ts`, display helpers in `format.ts`
- `src/app/globals.css` plus `src/app/styles/*.css` — global styles split in cascade order and imported in that order by `src/app/layout.tsx`; keep the order when adding files

## Keeping up with Spoon

Check the [Spoon Open API changelog](https://developers.spooncast.net/docs/changelog) now and then. v1.1.0–v1.2.0 brought `/v1/me`, follow events, donation history, and subscription info; new scopes must be approved in Spoon Developers before they are added to `SPOON_SCOPES`.
