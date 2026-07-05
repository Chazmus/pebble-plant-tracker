#!/bin/bash
# Stop script on first error
set -e

echo "=== 1. Building Settings Page HTML ==="
npm run build-config

echo "=== 2. Building Pebble Watchapp ==="
pebble build

echo "=== 3. Deploying to Watch via CloudPebble ==="
pebble install --cloudpebble
