import path from 'path';
import app from './app';

// Ensure bin directory with static binaries (ffmpeg, ffprobe, yt-dlp) is on PATH
const possibleBinDirs = [
  path.resolve(process.cwd(), 'bin'),
  path.resolve(process.cwd(), 'apps/server/bin')
];
for (const dir of possibleBinDirs) {
  if (process.env.PATH && !process.env.PATH.includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  }
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Cinemiq Server ready at http://localhost:${PORT}`);
});
