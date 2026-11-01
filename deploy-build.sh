#!/usr/bin/env bash
# exit on error
set -o errexit

# 1. Install all dependencies
npm install

# 2. Initialize Prisma Client
npx --workspace=apps/server prisma generate

# 3. Fetch static Linux FFmpeg & FFprobe binaries from reliable GitHub CDN
echo "Setting up FFmpeg and FFprobe static binaries for Render environment..."
mkdir -p apps/server/bin

echo "Downloading ffmpeg from GitHub Releases..."
curl -fL "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-linux-64.zip" -o ffmpeg.zip
if command -v unzip >/dev/null 2>&1; then
  unzip -o ffmpeg.zip -d apps/server/bin/
else
  python3 -m zipfile -e ffmpeg.zip apps/server/bin/
fi
rm -f ffmpeg.zip

echo "Downloading ffprobe from GitHub Releases..."
curl -fL "https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffprobe-4.4.1-linux-64.zip" -o ffprobe.zip
if command -v unzip >/dev/null 2>&1; then
  unzip -o ffprobe.zip -d apps/server/bin/
else
  python3 -m zipfile -e ffprobe.zip apps/server/bin/
fi
rm -f ffprobe.zip

chmod +x apps/server/bin/ffmpeg apps/server/bin/ffprobe
echo "FFmpeg and FFprobe installed successfully in apps/server/bin!"

# 4. Fetch static Linux yt-dlp binary for Render environment
echo "Setting up yt-dlp binary for Render environment..."
curl -fL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o apps/server/bin/yt-dlp
chmod +x apps/server/bin/yt-dlp
echo "yt-dlp installed successfully in apps/server/bin!"
