#!/bin/bash

# Quick start script for Docker containers

set -e

echo "🐳 SERGIK Project Docker Setup"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating .env from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo "✓ Created .env file"
        echo "⚠️  Please edit .env with your actual API keys before continuing"
        read -p "Press Enter to continue after editing .env, or Ctrl+C to cancel..."
    else
        echo "❌ .env.example not found. Please create .env manually."
        exit 1
    fi
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "✓ Docker is running"
echo ""

# Build and start containers
echo "Building Docker images..."
docker-compose build

echo ""
echo "Starting containers..."
docker-compose up -d

echo ""
echo "✓ Containers started!"
echo ""
echo "🌐 Web application: http://localhost:3000"
echo ""
echo "Useful commands:"
echo "  View logs:    docker-compose logs -f"
echo "  Stop:         docker-compose down"
echo "  Restart:      docker-compose restart"
echo "  Health check: curl http://localhost:3000/api/health"
echo ""
echo "Or use the Makefile:"
echo "  make logs     - View logs"
echo "  make down     - Stop containers"
echo "  make restart - Restart containers"
echo ""

