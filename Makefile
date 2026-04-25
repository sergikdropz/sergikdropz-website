.PHONY: help build up down logs restart clean dev test

# Default target
help:
	@echo "SERGIK Project Docker Commands"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  build      - Build Docker images"
	@echo "  up         - Start containers in detached mode"
	@echo "  down       - Stop and remove containers"
	@echo "  logs       - View container logs"
	@echo "  restart    - Restart containers"
	@echo "  clean      - Remove containers, images, and volumes"
	@echo "  dev        - Run in development mode (with hot reload)"
	@echo "  shell      - Open shell in running container"
	@echo "  health     - Check container health status"

# Build Docker images
build:
	docker-compose build

# Start containers
up:
	docker-compose up -d

# Stop containers
down:
	docker-compose down

# View logs
logs:
	docker-compose logs -f web

# Restart containers
restart:
	docker-compose restart

# Clean everything
clean:
	docker-compose down -v --rmi all

# Development mode (with volume mounts for hot reload)
dev:
	docker-compose up

# Open shell in container
shell:
	docker-compose exec web sh

# Check health
health:
	@docker ps --filter "name=sergik-web" --format "table {{.Names}}\t{{.Status}}"
	@echo ""
	@curl -s http://localhost:3000/api/health | python3 -m json.tool || echo "Health check endpoint not responding"

# Build and start
start: build up
	@echo "Containers started. Visit http://localhost:3000"

