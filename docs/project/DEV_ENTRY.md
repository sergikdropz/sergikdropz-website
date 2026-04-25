# Development Entry Guide

Short, high-signal steps for daily development.

## Web (Next.js)

```bash
cd web
npm install
npm run dev
```

- Default dev URL: http://localhost:3001
- Alternate port: `npm run dev:3000`
- Env: create `web/.env.local` (see `web/docs/environment/ENV_VARIABLES.md`)

## Mobile (Expo)

```bash
cd mobile
npm install
npm run start
```

- Use Expo to run iOS/Android or scan QR with Expo Go.

## Docker (Production-like)

```bash
cp .env.example .env
./docker-start.sh
```

- App URL: http://localhost:3000
- Health: http://localhost:3000/api/health

## Vercel Deploy

- Set project Root Directory to `web`.
- Build command: `npm run build`
- Output directory: `.next`
