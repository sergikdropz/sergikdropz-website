# Docker Containerization Guide

This guide explains how to containerize and run the SERGIK project using Docker.

## Prerequisites

- Docker Desktop installed (or Docker Engine + Docker Compose)
- Docker version 20.10 or higher
- Docker Compose version 2.0 or higher

## Quick Start

### 1. Set Up Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your actual API keys and configuration.

### 2. Build and Run with Docker Compose

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

The web application will be available at `http://localhost:3000`

## Manual Docker Commands

### Build the Docker Image

```bash
cd web
docker build -t sergik-web .
```

### Run the Container

```bash
docker run -d \
  --name sergik-web \
  -p 3000:3000 \
  --env-file ../.env \
  sergik-web
```

### View Logs

```bash
docker logs -f sergik-web
```

### Stop and Remove Container

```bash
docker stop sergik-web
docker rm sergik-web
```

## Development Mode

For development, you can mount the source code as a volume:

```bash
docker run -d \
  --name sergik-web-dev \
  -p 3000:3000 \
  -v $(pwd)/web:/app \
  -v /app/node_modules \
  -v /app/.next \
  --env-file ../.env \
  -e NODE_ENV=development \
  node:18-alpine sh -c "cd /app && npm install && npm run dev"
```

Or add a development service to `docker-compose.yml`:

```yaml
services:
  web-dev:
    build:
      context: ./web
      dockerfile: Dockerfile
    volumes:
      - ./web:/app
      - /app/node_modules
      - /app/.next
    environment:
      - NODE_ENV=development
    command: npm run dev
    ports:
      - "3000:3000"
```

## Environment Variables

Required environment variables (see `.env.example`):

- **STRIPE_SECRET_KEY**: Stripe secret key for payment processing
- **NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY**: Stripe publishable key
- **STRIPE_WEBHOOK_SECRET**: Stripe webhook signing secret
- **NEXT_PUBLIC_SITE_URL**: Your site URL (for production)

Optional environment variables:

- **SPOTIFY_CLIENT_ID**: Spotify API client ID (for artwork fetching)
- **SPOTIFY_CLIENT_SECRET**: Spotify API client secret
- **YOUTUBE_API_KEY**: YouTube Data API key (for video fetching)
- **YOUTUBE_CHANNEL_ID**: YouTube channel ID (defaults to @sergikdropz)

## Production Deployment

### Build for Production

```bash
docker-compose -f docker-compose.yml build
```

### Deploy to Production Server

1. Copy `.env` file to your production server
2. Copy `docker-compose.yml` to your production server
3. Run:

```bash
docker-compose up -d
```

### Using Docker Hub or Container Registry

1. Build and tag the image:

```bash
docker build -t your-registry/sergik-web:latest ./web
```

2. Push to registry:

```bash
docker push your-registry/sergik-web:latest
```

3. Pull and run on production:

```bash
docker pull your-registry/sergik-web:latest
docker run -d -p 3000:3000 --env-file .env your-registry/sergik-web:latest
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker-compose logs web
```

### Port already in use

Change the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Use port 3001 instead
```

### Environment variables not loading

Ensure `.env` file is in the same directory as `docker-compose.yml` and contains all required variables.

### Build fails

Clear Docker cache and rebuild:
```bash
docker-compose build --no-cache
```

### Permission issues

If you encounter permission issues with mounted volumes, ensure the Docker user has proper permissions or adjust file ownership.

## Health Checks

The container includes a health check that verifies the application is running. Check health status:

```bash
docker ps  # Shows health status
docker inspect sergik-web | grep Health -A 10
```

## Resource Limits

To set resource limits, add to `docker-compose.yml`:

```yaml
services:
  web:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Volumes

The `docker-compose.yml` mounts the `public` directory as read-only. If you need to write files, remove the `:ro` flag:

```yaml
volumes:
  - ./web/public:/app/public
```

## Next Steps

- Set up CI/CD to automatically build and deploy Docker images
- Configure reverse proxy (nginx) for production
- Set up monitoring and logging
- Configure SSL/TLS certificates
