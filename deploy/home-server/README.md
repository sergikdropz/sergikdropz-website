# SERGIK home server (Mac + Raspberry Pi)

This is the **self-hosted** stack: your own Postgres, Auth, and API on hardware you control. It replaces the cloud Supabase project that no longer resolves.

Web3 (wallets, tokens, IPFS) is a **separate product**. This stack is the self-sovereign move that actually keeps the current site running.

## What you get

| Service | Port | Role |
| --- | --- | --- |
| Caddy API gateway | `8000` | `/rest/v1` + `/auth/v1` (Supabase-compatible) |
| Postgres 16 | `54322` | Database (mapped off 5432 so it does not clash with local Postgres) |
| Next.js | `3001` (dev) or `3000` (Docker) | The website |

Seeded from repo files:

- `web/data/supabase-export/audio_files.json` (379 tracks)
- `web/data/gallery.json`
- `web/data/music-library.json`
- Admin user `admin@sergik.com`

On this Mac, `media/audio` is a symlink to `web/public/audio` (309+ MP3s). All 379 `audio_files` rows resolve to local `.mp3`s. With `NEXT_PUBLIC_LOCAL_AUDIO=1` (and a localhost Supabase URL), the site rewrites dead `*.supabase.co/storage/...` URLs to `/audio/...`. Do **not** set `NEXT_PUBLIC_LOCAL_AUDIO` on Vercel — those files are excluded from production deploys.

Production vault MP3s use `NEXT_PUBLIC_AUDIO_BASE_URL` (a public origin that serves `web/public`). On this Mac:

```bash
node deploy/home-server/scripts/media-server.mjs   # :8088, CORS + Range
cloudflared tunnel --url http://127.0.0.1:8088     # then set that origin on Vercel and redeploy
```

Keep that process running or hosted audio 404s. Public `/music` still uses Spotify/SoundCloud embeds and does not need the tunnel.

## Mac (right now)

Docker Desktop must be running.

```bash
cd deploy/home-server
node scripts/up.mjs
cd ../../web
npm run dev:stop && npm run dev:ensure
```

Then open http://localhost:3001/admin/login

Password is in `deploy/home-server/.env` (`ADMIN_PASSWORD`). Cloud keys are backed up to `web/.env.local.cloud.bak`.

## Raspberry Pi

1. 64-bit Raspberry Pi OS, 4 GB+ RAM, Docker + Compose installed.
2. Copy this repo (or `git pull`) onto the Pi.
3. Same commands as Mac from `deploy/home-server`.
4. Set `SITE_URL` and `API_EXTERNAL_URL` in `.env` to the Pi hostname or tunnel URL **before** `up.mjs` if the browser will not use `127.0.0.1`.
5. Put the site on the public internet with **Tailscale** (SSH + SMB) — do not port-forward 54322.

### Tailscale SSH + SMB (this network)

This Mac is `sergbook` (`100.120.251.10`). The Pi is registered as **`raspberrypi`** (`100.105.72.55`).

If `tailscale status` shows `offline` or `node key has expired`, power the Pi on and on the Pi run:

```bash
sudo tailscale up
sudo tailscale set --ssh
```

From this Mac (Homebrew Tailscale uses a userspace socket):

```bash
cd deploy/home-server
./scripts/ts.sh status
./scripts/pi-ssh.sh pi
```

SMB needs the **official Tailscale Mac app** (TUN/VPN), not Homebrew userspace networking. After the Pi is online and Samba is installed:

```bash
# on the Pi, once:
sudo bash pi/setup-samba.sh

# on the Mac (Tailscale.app running):
open "smb://raspberrypi/sergik"
```

Or use Finder → Go → Connect to Server → `smb://100.105.72.55/sergik`.


Example Compose on the Pi for the website itself (after `SERGIK_DOCKER_STANDALONE=1` build):

```bash
cd web
SERGIK_DOCKER_STANDALONE=1 npm run build
```

Or use the existing `web/Dockerfile` with build-arg `SERGIK_DOCKER_STANDALONE=1`.

## Restore cloud env

```bash
cp web/.env.local.cloud.bak web/.env.local
cd web && npm run dev:stop && npm run dev:ensure
```
