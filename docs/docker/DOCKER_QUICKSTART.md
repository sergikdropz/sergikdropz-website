# Docker Quick Start

## 🚀 Quick Start

```bash
# 1. Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# 2. Start containers
./docker-start.sh

# Or use make:
make start
```

## 📋 Common Commands

```bash
# Start containers
make up
# or: docker-compose up -d

# View logs
make logs
# or: docker-compose logs -f

# Stop containers
make down
# or: docker-compose down

# Restart containers
make restart

# Open shell in container
make shell

# Check health
make health
```

## 🔧 Manual Docker Commands

```bash
# Build image
docker-compose build

# Start container
docker-compose up -d

# View logs
docker-compose logs -f web

# Stop container
docker-compose down

# Remove everything
docker-compose down -v --rmi all
```

## 🌐 Access

- Web App (Docker): http://localhost:3000
- Health Check: http://localhost:3000/api/health

## 📝 Environment Variables

Required in `.env`:
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_SITE_URL`

Optional:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `YOUTUBE_API_KEY`
- `YOUTUBE_CHANNEL_ID`

## 🐛 Troubleshooting

**Port already in use?**
- Change port in `docker-compose.yml`: `"3001:3000"`

**Container won't start?**
- Check logs: `docker-compose logs web`
- Verify `.env` file exists and has all required variables

**Build fails?**
- Clear cache: `docker-compose build --no-cache`

For more details, see [DOCKER_GUIDE.md](./DOCKER_GUIDE.md)
