import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export interface RenderClip {
  id: string;
  type: 'video' | 'image' | 'audio' | 'text';
  source: string;
  offset: number;     // start position on timeline (seconds)
  duration: number;   // active length of clip (seconds)
  start: number;      // trim start in source (seconds)
  volume: number;     // volume multiplier
  speed: number;      // speed coefficient
  muted: boolean;
  transform?: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    opacity: number;
  };
  textConfig?: {
    content: string;
    fontSize: number;
    color: string;
    fontFamily: string;
    x: number;
    y: number;
  };
  effects?: any[];
}

export interface RenderProject {
  id: string;
  name: string;
  resolution: { width: number; height: number };
  fps: number;
  tracks?: any[];
  clips: RenderClip[];
}

export class CommandBuilder {
  static build(project: RenderProject, outputPath: string): ffmpeg.FfmpegCommand {
    const cmd = ffmpeg();
    const resolution = project.resolution || { width: 1280, height: 720 };
    const fps = project.fps || 30;

    const totalDuration = project.clips.length > 0
      ? Math.max(...project.clips.map(c => c.offset + c.duration))
      : 5;

    // 1. Setup default canvas input (black image loop)
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

    // Filter text/empty assets
    const assetClips = project.clips.filter(c => c.type !== 'text' && c.source);

    // 2. Add each active file resource as an input
    assetClips.forEach((clip) => {
      const isUrl = clip.source.startsWith('http');
      const sourcePath = isUrl
        ? clip.source
        : path.resolve(process.cwd(), clip.source.replace(/^\//, ''));

      cmd.input(sourcePath);

      // Trim values
      if (clip.type === 'video' || clip.type === 'audio') {
        cmd.inputOptions([`-ss ${clip.start}`, `-t ${clip.duration}`]);
      } else if (clip.type === 'image') {
        cmd.inputOptions(['-loop 1', `-t ${clip.duration}`]);
      }
    });

    // 3. Construct Complex Filter Graph
    const filterComplex: string[] = [];
    filterComplex.push(`[0:v]scale=${resolution.width}:${resolution.height},setsar=1[bg]`);
    let currentVideoLabel = '[bg]'; // start with base black color layout

    // Video & Image Layer Composites
    assetClips.forEach((clip, idx) => {
      if (clip.type === 'video' || clip.type === 'image') {
        const inputIdx = idx + 1; // 0 is color background block
        const scaledLabel = `scaled${idx}`;
        const overlayLabel = `v_over${idx}`;
        const transform = clip.transform || { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

        // Scale, crop to fit workspace dimensions
        let scaleFilter = `[${inputIdx}:v]scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

        // Apply fade transition if specified
        const fadeFx = clip.effects?.find((e: any) => e.type === 'fade');
        if (fadeFx) {
          const fadeDuration = fadeFx.duration || 0.5;
          scaleFilter += `,format=rgba,fade=t=in:st=0:d=${fadeDuration}:alpha=1`;
        }

        filterComplex.push(`${scaleFilter}[${scaledLabel}]`);

        // Overlay with timeline offset positioning
        const xOffset = Math.round(resolution.width * (transform.x / 100));
        const yOffset = Math.round(resolution.height * (transform.y / 100));

        filterComplex.push(
          `${currentVideoLabel}[${scaledLabel}]overlay=x=${xOffset}:y=${yOffset}:enable='between(t,${clip.offset},${clip.offset + clip.duration})'[${overlayLabel}]`
        );
        currentVideoLabel = `[${overlayLabel}]`;
      }
    });

    // Typography overlays
    project.clips.filter(c => c.type === 'text').forEach((textClip, idx) => {
      const nextLabel = `txt${idx}`;
      const config = textClip.textConfig || { content: '', fontSize: 32, color: 'white', x: 50, y: 50 };
      const content = config.content.replace(/'/g, "'\\\\\\''").replace(/:/g, '\\:');

      const xPct = (config.x ?? 50) / 100;
      const yPct = (config.y ?? 50) / 100;

      const colorVal = config.color ? (config.color.startsWith('#') ? config.color.replace('#', '0x') : config.color) : 'white';

      filterComplex.push(
        `${currentVideoLabel}drawtext=text='${content}':fontcolor=${colorVal}:fontsize=${config.fontSize}:x=(w-text_w)*${xPct}:y=(h-text_h)*${yPct}:enable='between(t,${textClip.offset},${textClip.offset + textClip.duration})'[${nextLabel}]`
      );
      currentVideoLabel = `[${nextLabel}]`;
    });

    // Audio Mixer Pipeline
    const audioInputIndices: string[] = [];
    assetClips.forEach((clip, idx) => {
      if (clip.type === 'audio' && !clip.muted) {
        audioInputIndices.push(`[${idx + 1}:a]`);
      }
    });

    if (audioInputIndices.length > 0) {
      filterComplex.push(
        `${audioInputIndices.join('')}amix=inputs=${audioInputIndices.length}:duration=longest[outa]`
      );
    }

    if (filterComplex.length > 0) {
      cmd.complexFilter(filterComplex.join(';'));
    }

    // Output bindings
    cmd.outputOptions([
      `-map ${currentVideoLabel}`,
      audioInputIndices.length > 0 ? '-map [outa]' : '-map 0:a?',
      '-c:v libx264',
      '-pix_fmt yuv420p',
      '-preset fast',
      '-crf 23',
      '-y'
    ]);

    return cmd;
  }
}
