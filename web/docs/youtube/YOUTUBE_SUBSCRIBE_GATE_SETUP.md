# YouTube subscribe gate (@sergikdropz)

Fans unlock **Watch Video** and **Share to Instagram** on release visualizers after Google confirms a subscription to `@sergikdropz`.

## Google Cloud (one-time)

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → **Enable YouTube Data API v3**.
2. **Credentials → Create credentials → API key** → restrict to YouTube Data API → `YOUTUBE_API_KEY`.
3. **OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://sergikdropz.com`, `http://localhost:3001`
   - Authorized redirect URIs:
     - `https://sergikdropz.com/api/youtube/subscribe-gate/callback`
     - `http://localhost:3001/api/youtube/subscribe-gate/callback`
4. Copy **Client ID** and **Client secret** → `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`.
5. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to the same client ID (in-page Google token fallback).

**Subscribe to watch** opens a card on the music page. **Subscribe to @sergikdropz** opens YouTube’s own subscribe confirmation in a small window, which is what subscribes the Google account to the channel. The music page stays. Closing that window after subscribing saves the email with the tag `youtube-subscriber` and opens the video.

## OAuth consent screen (Google verification)

On the Google Auth Platform branding / data-access form, use these public pages:

- Application privacy policy link: `https://sergikdropz.com/privacy`
- Application terms of service link: `https://sergikdropz.com/terms`

Both pages must be live on the production domain before Google’s review fetches them. The footer and the Sign in with Google step link to the same URLs. Add `sergikdrops@gmail.com` under Audience → Test users while the app stays in Testing.

## Automated setup (macOS — Chrome + AppleScript)

```bash
cd web
npm run setup:youtube-subscribe-gate:chrome
```

This opens Google Cloud in **Google Chrome** (your signed-in session), shows a checklist dialog, then prompts (hidden) for API key, OAuth client ID, and secret. It updates `.env.local`, pushes to Vercel, restarts dev, and runs smoke + Playwright.

Playwright MCP can assist the OAuth redirect flow after deploy; the isolated MCP browser is not signed into Google — use Chrome for credential creation.

## Local (`web/.env.local`)

```env
YOUTUBE_API_KEY=
YOUTUBE_CHANNEL_ID=@sergikdropz
YOUTUBE_OAUTH_CLIENT_ID=
YOUTUBE_OAUTH_CLIENT_SECRET=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
# Optional — uses FAN_VAULT_UNLOCK_SECRET if unset
YT_SUB_GATE_SECRET=
```

Restart dev: `npm run dev:restart`

## Vercel

From `web/` after `.env.local` is filled:

```bash
node scripts/push-youtube-subscribe-gate-env.mjs
```

Or set the same keys in Vercel → Project → Settings → Environment Variables, then **Redeploy**.

## Verify

```bash
npm run smoke:youtube-subscribe-gate
SMOKE_BASE=https://sergikdropz.com npm run smoke:youtube-subscribe-gate
```

Manual fan flow:

1. Open a public EP with a saved YouTube visualizer (e.g. Synthedelics).
2. Click **Watch Video** → **Subscribe to watch**.
3. In the card, enter the email and press **Subscribe to @sergikdropz**. YouTube’s confirmation opens in a small window. Press Subscribe there.
4. Close that window. The email is saved with the tag `youtube-subscriber`, and the video opens.
5. `/api/youtube/subscribe-gate/status` should show `configured: true`, `subscriberCount` (when API key works), `unlocked: true` after success.

Admin: `GET /api/admin/youtube/subscribe-gate/health` (session required) mirrors status + API probe.
