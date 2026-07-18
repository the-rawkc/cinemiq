import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export interface TimelineClip {
  id: string;
  type: 'video' | 'image' | 'audio' | 'text';
  source: string;
  start: number;
  end: number;
  offset: number;
  duration: number;
  trackId: string;
  textConfig?: {
    content: string;
    fontSize: number;
    color: string;
  };
}

export interface CinemiqProject {
  id: string;
  name: string;
  resolution: { width: number; height: number };
  fps: number;
  clips: TimelineClip[];
}

export const EditorService = {
  async renderProject(project: CinemiqProject): Promise<string> {
    const videoName = `render-${Date.now()}.mp4`;
    const outputPath = path.resolve(process.cwd(), 'uploads', videoName);

    const totalDuration = project.clips.length > 0
      ? Math.max(...project.clips.map(c => c.offset + c.duration))
      : 5; // Default 5s if empty

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg();

      // 1. Black Background Input (Base)
      const base64BlackPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const blackPngPath = path.resolve(process.cwd(), 'uploads', 'black.png');
      if (!fs.existsSync(blackPngPath)) {
        const uploadDir = path.dirname(blackPngPath);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        fs.writeFileSync(blackPngPath, Buffer.from(base64BlackPng, 'base64'));
      }
      cmd.input(blackPngPath)
        .inputOptions(['-loop 1', `-t ${totalDuration}`]);

      // 2. Add All Asset Inputs (Video, Image, Audio)
      const assetClips = project.clips.filter(c => c.type !== 'text');
      assetClips.forEach(clip => {
        const sourcePath = clip.source.startsWith('http')
          ? clip.source
          : path.resolve(process.cwd(), clip.source.replace(/^\//, ''));

        cmd.input(sourcePath);
        if (clip.type === 'video' || clip.type === 'audio') {
          cmd.inputOptions([`-ss ${clip.start}`, `-t ${clip.duration}`]);
        } else if (clip.type === 'image') {
          cmd.inputOptions(['-loop 1', `-t ${clip.duration}`]);
        }
      });

      // 3. Build Filter Complex
      const filterComplex: string[] = [];
      filterComplex.push(`[0:v]scale=${project.resolution.width}:${project.resolution.height},setsar=1[bg]`);
      let currentVideoLabel = '[bg]'; // The black background layout

      // Process Video/Image overlays
      assetClips.forEach((clip, i) => {
        if (clip.type === 'video' || clip.type === 'image') {
          const inputIdx = i + 1; // +1 because index 0 is the background
          const scaledLabel = `scaled${i}`;
          const overlayLabel = `v_over${i}`;

          // Scale asset to fit project resolution
          filterComplex.push(`[${inputIdx}:v]scale=${project.resolution.width}:${project.resolution.height}:force_original_aspect_ratio=decrease,pad=${project.resolution.width}:${project.resolution.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[${scaledLabel}]`);

          // Overlay on current base at absolute offset
          filterComplex.push(`${currentVideoLabel}[${scaledLabel}]overlay=enable='between(t,${clip.offset},${clip.offset + clip.duration})'[${overlayLabel}]`);
          currentVideoLabel = `[${overlayLabel}]`;
        }
      });

      // Process Text Overlays
      project.clips.filter(c => c.type === 'text').forEach((textClip, i) => {
        const nextLabel = `txt${i}`;
        const config = textClip.textConfig || { content: '', fontSize: 48, color: 'white' };
        const content = config.content.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');
        filterComplex.push(`${currentVideoLabel}drawtext=text='${content}':fontcolor=${config.color}:fontsize=${config.fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${textClip.offset},${textClip.offset + textClip.duration})'[${nextLabel}]`);
        currentVideoLabel = `[${nextLabel}]`;
      });

      // Process Audio Mixing
      const audioInputIndices: string[] = [];
      assetClips.forEach((clip, i) => {
        if (clip.type === 'audio') {
          audioInputIndices.push(`[${i + 1}:a]`);
        }
      });

      if (audioInputIndices.length > 0) {
        filterComplex.push(`${audioInputIndices.join('')}amix=inputs=${audioInputIndices.length}:duration=longest[outa]`);
      }

      cmd
        .complexFilter(filterComplex.join(';'))
        .outputOptions([
          `-map ${currentVideoLabel}`,
          audioInputIndices.length > 0 ? '-map [outa]' : '-map 0:a?',
          '-c:v libx264',
          '-pix_fmt yuv420p',
          '-preset fast',
          '-crf 22',
          '-y'
        ])
        .on('start', (cmdLine) => console.log('FFmpeg Render Start:', cmdLine))
        .on('error', (err) => {
          console.error('Render Error:', err);
          reject(err);
        })
        .on('end', () => {
          console.log('Render Complete:', videoName);
          resolve(`/uploads/${videoName}`);
        })
        .save(outputPath);
    });
  }
};
