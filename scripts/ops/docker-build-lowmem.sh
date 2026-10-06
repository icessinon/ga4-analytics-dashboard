#!/usr/bin/env bash
# t3a.medium（4GB）等で Docker ビルド時に OOM/CPU を使い果たさないためのリソース制限付きビルド
set -e
cd "$(dirname "$0")/.."
IMAGE_NAME="${1:-ga4-analytics-dashboard:latest}"
echo "Building image: $IMAGE_NAME"
DOCKER_BUILDKIT=1 docker build -t "$IMAGE_NAME" -f Dockerfile .
echo "Done. Run: docker compose up -d"
