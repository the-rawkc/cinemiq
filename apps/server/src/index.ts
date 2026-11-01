import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
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

// Explicitly register ffmpeg & ffprobe paths if static binaries are present
const ffmpegBinary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const ffprobeBinary = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

for (const dir of possibleBinDirs) {
  const ffp = path.join(dir, ffmpegBinary);
  if (fs.existsSync(ffp)) {
    ffmpeg.setFfmpegPath(ffp);
    console.log(`🎬 [FFmpeg] Bound binary to: ${ffp}`);
    break;
  }
}
for (const dir of possibleBinDirs) {
  const fpp = path.join(dir, ffprobeBinary);
  if (fs.existsSync(fpp)) {
    ffmpeg.setFfprobePath(fpp);
    console.log(`🔍 [FFprobe] Bound binary to: ${fpp}`);
    break;
  }
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Cinemiq Server ready at http://localhost:${PORT}`);
});
