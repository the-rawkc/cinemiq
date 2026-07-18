#!/usr/bin/env bash
# exit on error
set -o errexit

# 1. Install all dependencies
npm install

# 2. Initialize Prisma Client
npx --workspace=apps/server prisma generate

# 3. Fetch static Linux FFmpeg binaries
echo "Setting up FFmpeg static binaries for Render environment..."
mkdir -p apps/server/bin
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar -xJ --strip-components=1 -C apps/server/bin
chmod +x apps/server/bin/ffmpeg apps/server/bin/ffprobe
echo "FFmpeg installed successfully in apps/server/bin!"
