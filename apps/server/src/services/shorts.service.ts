import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import * as archiverModule from 'archiver';
import OpenAI from 'openai';

export interface VideoInfo {
  id: string;
  title: string;
  duration: number; // in seconds
  thumbnail: string;
  channel: string;
  description: string;
  webpage_url: string;
  view_count?: number;
  tags?: string[];
  categories?: string[];
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

export type CaptionStyle = 'hormozi' | 'neon' | 'mrbeast' | 'karaoke' | 'minimal' | 'none';

export interface ViralClip {
  id: string;
  title: string;
  startTime: number; // seconds
  endTime: number; // seconds
  duration: number; // seconds
  viralityScore: number; // 0-100
  reason: string;
  hook: string;
  suggestedHeadline: string;
  tags: string[];
  transcriptSegments?: TranscriptSegment[];
  pacing?: string;
  engagementType?: string;
  wordCount?: number;
  speechTempo?: string;
  recommendedDescription?: string;
  titleVariants?: string[];
  keyTopics?: string[];
}

export interface DownloadProgress {
  percent: number;
  speed?: string;
  totalSize?: string;
  eta?: string;
}

export interface ShortsJob {
  id: string;
  url?: string;
  status: 'pending' | 'downloading' | 'analyzing' | 'done' | 'failed';
  progress: number;
  stage: string;
  videoInfo?: VideoInfo;
  videoPath?: string;
  videoUrl?: string;
  clips?: ViralClip[];
  transcript?: TranscriptSegment[];
  error?: string;
  downloadProgress?: DownloadProgress;
  // Timing & Telemetry
  generationTimeMs?: number;
  downloadTimeMs?: number;
  downloadStartTime?: number;
  downloadEndTime?: number;
  isCachedSource?: boolean;
  hashtags?: string[];
}

// In-memory active jobs store
const activeJobs = new Map<string, ShortsJob>();

// In-memory render cache for 0ms repeat exports
const renderCache = new Map<string, { url: string; duration: number; filePath: string }>();

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export function getUploadsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'uploads', 'shorts'),
    path.resolve(process.cwd(), 'apps', 'server', 'uploads', 'shorts'),
    path.resolve(process.cwd(), '..', 'uploads', 'shorts'),
    path.resolve(process.cwd(), '..', '..', 'uploads', 'shorts'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const defaultDir = candidates[0];
  fs.mkdirSync(defaultDir, { recursive: true });
  return defaultDir;
}

export function getMusicDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'uploads', 'music'),
    path.resolve(process.cwd(), 'apps', 'server', 'uploads', 'music'),
    path.resolve(process.cwd(), '..', 'uploads', 'music'),
    path.resolve(process.cwd(), '..', '..', 'uploads', 'music'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  const defaultDir = candidates[0];
  fs.mkdirSync(defaultDir, { recursive: true });
  return defaultDir;
}

export function getCopyrightFreeMusicTracks() {
  ensureDefaultMusicTracks();
  return [
    {
      id: 'lofi-sunset',
      name: 'Lofi Sunset Chill',
      genre: 'Lo-Fi / Study / Relaxed',
      mood: 'Chill & Relaxed',
      url: '/uploads/music/lofi-sunset.mp3',
    },
    {
      id: 'energetic-hype',
      name: 'Energetic Hype',
      genre: 'Upbeat / Action / Electronic',
      mood: 'Hype & Dynamic',
      url: '/uploads/music/energetic-hype.mp3',
    },
    {
      id: 'cinematic-suspense',
      name: 'Cinematic Suspense',
      genre: 'Dramatic / Mystery / Tension',
      mood: 'Epic & Suspenseful',
      url: '/uploads/music/cinematic-suspense.mp3',
    },
    {
      id: 'ambient-focus',
      name: 'Ambient Focus',
      genre: 'Calm / Inspiring / Tech',
      mood: 'Modern & Clean',
      url: '/uploads/music/ambient-focus.mp3',
    },
    {
      id: 'studio-beat',
      name: 'Studio Beats',
      genre: 'Hip Hop / Rhythmic / Urban',
      mood: 'Punchy & Groovy',
      url: '/uploads/music/studio-beat.mp3',
    },
    {
      id: 'modern-rhythm',
      name: 'Modern Rhythm',
      genre: 'Pop / Upbeat / Trending',
      mood: 'Bright & Positive',
      url: '/uploads/music/modern-rhythm.mp3',
    },
    {
      id: 'none',
      name: 'Original Audio Only (No Music)',
      genre: 'Clean Dialogue',
      mood: 'Original',
      url: '',
    },
  ];
}

export function ensureDefaultMusicTracks(): void {
  const musicDir = getMusicDir();
  if (!fs.existsSync(musicDir)) {
    fs.mkdirSync(musicDir, { recursive: true });
  }

  const trackSpecs: Array<{ name: string; filter: string }> = [
    {
      name: 'lofi-sunset.mp3',
      filter: 'sine=frequency=220:duration=60,volume=0.25,lowpass=f=1200,aphaser=in_gain=0.6:out_gain=0.7:delay=3:decay=0.4:speed=0.5',
    },
    {
      name: 'energetic-hype.mp3',
      filter: 'sine=frequency=140:duration=60,volume=0.25,firequalizer=gain=\'gain_interpolate(f, 60, 4, 250, 2, 1000, 0)\'',
    },
    {
      name: 'cinematic-suspense.mp3',
      filter: 'sine=frequency=65:duration=60,volume=0.3,lowpass=f=400,aecho=0.8:0.9:500:0.4',
    },
    {
      name: 'ambient-focus.mp3',
      filter: 'sine=frequency=330:duration=60,volume=0.2,aecho=0.8:0.88:400:0.5',
    },
    {
      name: 'studio-beat.mp3',
      filter: 'sine=frequency=120:duration=60,volume=0.28,aecho=0.8:0.7:250:0.3',
    },
    {
      name: 'modern-rhythm.mp3',
      filter: 'sine=frequency=180:duration=60,volume=0.25,aecho=0.8:0.8:300:0.35',
    },
  ];

  for (const t of trackSpecs) {
    const dest = path.join(musicDir, t.name);
    if (!fs.existsSync(dest)) {
      try {
        spawn(
          'ffmpeg',
          ['-f', 'lavfi', '-i', t.filter, '-c:a', 'libmp3lame', '-b:a', '192k', '-t', '60', '-y', dest],
          { windowsHide: true }
        );
      } catch {}
    }
  }
}

function getYtDlpBinary(): string {
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const localBin = path.resolve(process.cwd(), 'bin', binaryName);
  if (fs.existsSync(localBin)) return localBin;

  const serverBin = path.resolve(process.cwd(), 'apps', 'server', 'bin', binaryName);
  if (fs.existsSync(serverBin)) return serverBin;

  return 'yt-dlp';
}

/**
 * Check for YouTube cookies in uploads, project root, or via YOUTUBE_COOKIES environment variable
 */
function getCookieArgs(uploadsDir: string): string[] {
  if (process.env.YOUTUBE_COOKIES) {
    try {
      const cFile = path.join(uploadsDir, 'cookies.txt');
      if (!fs.existsSync(cFile) || fs.statSync(cFile).size < 10) {
        fs.writeFileSync(cFile, process.env.YOUTUBE_COOKIES, 'utf-8');
      }
    } catch {}
  }
  const possibleCookies = [
    path.join(uploadsDir, 'cookies.txt'),
    path.join(uploadsDir, 'youtube_cookies.txt'),
    path.resolve(process.cwd(), 'cookies.txt'),
  ];
  for (const cPath of possibleCookies) {
    if (fs.existsSync(cPath)) {
      return ['--cookies', cPath];
    }
  }
  return [];
}

/**
 * Strips all numberings, part numbers, and counter suffixes from titles
 * e.g. "The Heated Debate (Part 1)" -> "The Heated Debate"
 * e.g. "Viral Highlight #2" -> "Viral Highlight"
 * e.g. "1. Shocking Secret" -> "Shocking Secret"
 */
function cleanClipTitle(rawTitle: string, fallback: string = 'Highlight Moment'): string {
  if (!rawTitle) return fallback;
  let cleaned = rawTitle
    .replace(/\s*\(Part\s*\d+\)/gi, '')
    .replace(/\s*Part\s*\d+/gi, '')
    .replace(/\s*#\d+/g, '')
    .replace(/^[0-9]+[\.\-\:\s]+/, '')
    .replace(/\s*-\s*\d+$/, '')
    .replace(/\s*:\s*\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

/**
 * Strips all numberings from overlay headlines
 */
function cleanHeadline(rawHeadline: string, fallback: string = 'VIRAL HIGHLIGHT'): string {
  if (!rawHeadline) return fallback;
  let cleaned = rawHeadline
    .replace(/\s*\(Part\s*\d+\)/gi, '')
    .replace(/\s*Part\s*\d+/gi, '')
    .replace(/\s*#\d+/g, '')
    .replace(/^[0-9]+[\.\-\:\s]+/, '')
    .replace(/\s*-\s*\d+$/, '')
    .replace(/\s*:\s*\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.toUpperCase() || fallback;
}

/**
 * Ensures strict non-overlap between a candidate clip and all accepted clips
 */
function hasOverlapWithAccepted(
  candidateStart: number,
  candidateEnd: number,
  acceptedList: Array<{ startTime: number; endTime: number }>,
  maxOverlapSeconds: number = 4
): boolean {
  for (const acc of acceptedList) {
    const oStart = Math.max(candidateStart, acc.startTime);
    const oEnd = Math.min(candidateEnd, acc.endTime);
    if (oEnd > oStart) {
      const overlapDur = oEnd - oStart;
      if (overlapDur > maxOverlapSeconds) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Parse WebVTT subtitle file into rich timestamped segments with word-level cues
 */
function parseVTTFile(filePath: string): TranscriptSegment[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const segments: TranscriptSegment[] = [];

  const timeRegex = /(\d{2}):(\d{2}):(\d{2}\.\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}\.\d{3})/;
  const shortTimeRegex = /(\d{2}):(\d{2}\.\d{3})\s*-->\s*(\d{2}):(\d{2}\.\d{3})/;

  let currentStart = 0;
  let currentEnd = 0;
  let currentRawLines: string[] = [];

  const flushCue = () => {
    if (currentRawLines.length === 0 || currentEnd <= currentStart) return;
    const combined = currentRawLines.join(' ');
    // Filter noise like [Music], [Applause]
    const cleanText = combined.replace(/\[[^\]]*\]/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) {
      currentRawLines = [];
      return;
    }

    const wordsList = cleanText.split(/\s+/).filter(Boolean);
    const duration = Math.max(0.3, currentEnd - currentStart);
    const wordDur = duration / Math.max(1, wordsList.length);

    const words: TranscriptWord[] = wordsList.map((w, idx) => ({
      word: w,
      start: Math.round((currentStart + idx * wordDur) * 1000) / 1000,
      end: Math.round((currentStart + (idx + 1) * wordDur) * 1000) / 1000,
    }));

    segments.push({
      start: Math.round(currentStart * 1000) / 1000,
      end: Math.round(currentEnd * 1000) / 1000,
      text: cleanText,
      words,
    });
    currentRawLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flushCue();
      continue;
    }

    const matchLong = line.match(timeRegex);
    const matchShort = line.match(shortTimeRegex);

    if (matchLong) {
      flushCue();
      currentStart = parseInt(matchLong[1], 10) * 3600 + parseInt(matchLong[2], 10) * 60 + parseFloat(matchLong[3]);
      currentEnd = parseInt(matchLong[4], 10) * 3600 + parseInt(matchLong[5], 10) * 60 + parseFloat(matchLong[6]);
    } else if (matchShort) {
      flushCue();
      currentStart = parseInt(matchShort[1], 10) * 60 + parseFloat(matchShort[2]);
      currentEnd = parseInt(matchShort[3], 10) * 60 + parseFloat(matchShort[4]);
    } else if (currentEnd > 0 && !line.startsWith('WEBVTT') && !line.startsWith('Kind:') && !line.startsWith('Language:')) {
      currentRawLines.push(line);
    }
  }
  flushCue();

  // Deduplicate rolling YouTube auto-sub repetitions
  const deduped: TranscriptSegment[] = [];
  for (const s of segments) {
    if (deduped.length > 0) {
      const prev = deduped[deduped.length - 1];
      if (prev.text.toLowerCase() === s.text.toLowerCase() && Math.abs(prev.end - s.start) < 0.5) {
        prev.end = Math.max(prev.end, s.end);
        continue;
      }
    }
    deduped.push(s);
  }

  return deduped;
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Generate kinetic ASS subtitle file for FFmpeg burning
 */
export function generateAssSubtitles(params: {
  segments: TranscriptSegment[];
  clipStartTime: number;
  clipEndTime: number;
  style: CaptionStyle;
  targetResolution?: '720p' | '1080p';
  uploadsDir: string;
}): string | null {
  const { segments, clipStartTime, clipEndTime, style, targetResolution, uploadsDir } = params;
  if (!style || style === 'none' || !segments || segments.length === 0) return null;

  const is1080p = targetResolution === '1080p';
  const playResX = is1080p ? 1080 : 720;
  const playResY = is1080p ? 1920 : 1280;

  let fontSize = is1080p ? 54 : 38;
  const fontName = 'Arial';
  let primaryColor = '&H00FFFFFF&';
  let secondaryColor = '&H001FE8FF&'; // Yellow active in ASS BGR
  const outlineColor = '&H00000000&';
  const backColor = '&H80000000&';
  let bold = -1; // -1 = bold true
  let outline = is1080p ? 6 : 4.5;
  let shadow = is1080p ? 3 : 2;
  const marginV = is1080p ? 320 : 220; // Lower center vertical safe area

  if (style === 'hormozi') {
    fontSize = is1080p ? 58 : 42;
    primaryColor = '&H00FFFFFF&';
    secondaryColor = '&H001FE8FF&'; // Hormozi Yellow Pop
    outline = is1080p ? 7 : 5;
  } else if (style === 'neon') {
    fontSize = is1080p ? 56 : 40;
    primaryColor = '&H00FFFFFF&';
    secondaryColor = '&H00FFFF00&'; // Electric Cyan
    outline = is1080p ? 6 : 4.5;
  } else if (style === 'mrbeast') {
    fontSize = is1080p ? 62 : 44;
    primaryColor = '&H00FFFFFF&';
    secondaryColor = '&H0014FF39&'; // Bright Lime Green
    outline = is1080p ? 8 : 5.5;
  } else if (style === 'karaoke') {
    fontSize = is1080p ? 54 : 38;
    primaryColor = '&H00B0B0B0&';
    secondaryColor = '&H001FE8FF&';
  } else if (style === 'minimal') {
    fontSize = is1080p ? 42 : 30;
    primaryColor = '&H00FFFFFF&';
    secondaryColor = '&H00FFFFFF&';
    outline = 2;
    shadow = 1;
    bold = 0;
  }

  const assHeader = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${playResX}`,
    `PlayResY: ${playResY}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Kinetic,${fontName},${fontSize},${primaryColor},${secondaryColor},${outlineColor},${backColor},${bold},0,0,0,100,100,1,0,1,${outline},${shadow},2,30,30,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  // Support both full-video absolute timestamps and pre-sliced 0-indexed clips
  const firstSegStart = segments[0]?.start ?? 0;
  const isOffsetNeeded = clipStartTime === 0 && firstSegStart >= clipEndTime;
  const baseOffset = isOffsetNeeded ? firstSegStart : clipStartTime;

  let clipSegs: TranscriptSegment[] = [];
  if (isOffsetNeeded) {
    // Segments belong to this clip directly, offset them to start from 0
    clipSegs = segments.map((s) => ({
      ...s,
      start: Math.max(0, s.start - baseOffset),
      end: Math.max(0.3, s.end - baseOffset),
      words: s.words
        ? s.words.map((w) => ({
            ...w,
            start: Math.max(0, w.start - baseOffset),
            end: Math.max(0.1, w.end - baseOffset),
          }))
        : undefined,
    }));
  } else {
    // Segments are from full transcript, filter within [clipStartTime, clipEndTime]
    clipSegs = segments
      .filter((s) => s.end > clipStartTime && s.start < clipEndTime)
      .map((s) => ({
        ...s,
        start: Math.max(0, s.start - clipStartTime),
        end: Math.max(0.3, s.end - clipStartTime),
        words: s.words
          ? s.words.map((w) => ({
              ...w,
              start: Math.max(0, w.start - clipStartTime),
              end: Math.max(0.1, w.end - clipStartTime),
            }))
          : undefined,
      }));
  }

  if (clipSegs.length === 0) return null;

  const events: string[] = [];

  for (const seg of clipSegs) {
    const segStartRel = seg.start;
    const segEndRel = Math.max(segStartRel + 0.3, seg.end);
    const words = seg.words && seg.words.length > 0
      ? seg.words
      : seg.text.split(/\s+/).filter(Boolean).map((w, idx, arr) => {
          const wDur = (segEndRel - segStartRel) / Math.max(1, arr.length);
          return {
            word: w,
            start: segStartRel + idx * wDur,
            end: segStartRel + (idx + 1) * wDur,
          };
        });

    if (words.length === 0) {
      const cleanText = seg.text.replace(/[{}]/g, '').toUpperCase();
      events.push(`Dialogue: 0,${formatAssTime(segStartRel)},${formatAssTime(segEndRel)},Kinetic,,0,0,0,,${cleanText}`);
      continue;
    }

    if (style === 'karaoke') {
      const kParts = words.map((w) => {
        const durCs = Math.max(5, Math.round((w.end - w.start) * 100));
        return `{\\k${durCs}}${w.word.toUpperCase()} `;
      });
      events.push(`Dialogue: 0,${formatAssTime(segStartRel)},${formatAssTime(segEndRel)},Kinetic,,0,0,0,,${kParts.join('').trim()}`);
    } else {
      // Kinetic Word-by-Word Highlight Pop in 3-4 word clusters
      const clusterSize = 4;
      for (let i = 0; i < words.length; i += clusterSize) {
        const cluster = words.slice(i, i + clusterSize);
        const clusterStart = Math.max(0, cluster[0].start);
        const clusterEnd = Math.max(clusterStart + 0.4, cluster[cluster.length - 1].end);

        for (let activeIdx = 0; activeIdx < cluster.length; activeIdx++) {
          const activeWord = cluster[activeIdx];
          const wordStartRel = Math.max(clusterStart, activeWord.start);
          const wordEndRel = Math.min(clusterEnd, Math.max(wordStartRel + 0.15, activeWord.end));

          const activeColorTag =
            style === 'neon'
              ? '\\c&H00FFFF00&'
              : style === 'mrbeast'
              ? '\\c&H0014FF39&'
              : '\\c&H001FE8FF&';

          const formattedCluster = cluster
            .map((w, idx) => {
              const wText = w.word.replace(/[{}]/g, '').toUpperCase();
              if (idx === activeIdx) {
                return `{\\fscx112\\fscy112${activeColorTag}}${wText}{\\fscx100\\fscy100\\c${primaryColor}}`;
              }
              return wText;
            })
            .join(' ');

          events.push(`Dialogue: 0,${formatAssTime(wordStartRel)},${formatAssTime(wordEndRel)},Kinetic,,0,0,0,,${formattedCluster}`);
        }
      }
    }
  }

  if (events.length === 0) return null;

  const assContent = `${assHeader}\n${events.join('\n')}\n`;
  const assFilename = `sub-${crypto.randomBytes(6).toString('hex')}.ass`;
  const assPath = path.join(uploadsDir, assFilename);
  fs.writeFileSync(assPath, assContent, 'utf-8');

  return assPath;
}

function extractYouTubeId(url: string): string | null {
  try {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export const ShortsService = {
  /**
   * Fetch YouTube metadata without downloading video stream
   */
  async getVideoInfo(url: string): Promise<VideoInfo> {
    const ytId = extractYouTubeId(url);
    const uploadsDir = getUploadsDir();

    // 1. Instant local metadata cache check
    if (ytId) {
      const infoPath = path.join(uploadsDir, `yt-${ytId}.info.json`);
      if (fs.existsSync(infoPath)) {
        try {
          const raw = fs.readFileSync(infoPath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && parsed.title) {
            console.log(`⚡ [Shorts] Instant metadata cache hit: ${parsed.title}`);
            return parsed;
          }
        } catch {}
      }
    }

    // 2. Fast oEmbed metadata lookup (~100ms)
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (oembedRes.ok) {
        const odata = await oembedRes.json() as any;
        if (odata && odata.title) {
          console.log(`⚡ [Shorts] Instant oEmbed metadata hit: ${odata.title}`);
          const info: VideoInfo = {
            id: ytId || 'unknown',
            title: odata.title,
            duration: 180,
            thumbnail: odata.thumbnail_url || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : ''),
            channel: odata.author_name || 'YouTube',
            description: '',
            webpage_url: url,
            view_count: 50000,
            tags: ['#shorts', '#viral', '#trending'],
            categories: [],
          };

          // Save to disk immediately so future requests are 0ms
          if (ytId) {
            try {
              fs.writeFileSync(path.join(uploadsDir, `yt-${ytId}.info.json`), JSON.stringify(info, null, 2));
            } catch {}
          }

          // Asynchronously query exact duration without blocking the user
          (async () => {
            try {
              const durProc = spawn(getYtDlpBinary(), ['--skip-download', '--print', '%(duration)s', url], { windowsHide: true });
              let durOut = '';
              durProc.stdout.on('data', (d) => (durOut += d.toString()));
              durProc.on('close', () => {
                const sec = parseInt(durOut.trim(), 10);
                if (sec > 0 && ytId) {
                  info.duration = sec;
                  try {
                    fs.writeFileSync(path.join(uploadsDir, `yt-${ytId}.info.json`), JSON.stringify(info, null, 2));
                  } catch {}
                }
              });
            } catch {}
          })();

          return info;
        }
      }
    } catch {}

    return new Promise((resolve, reject) => {
      const args = [
        '--js-runtimes',
        'node',
        '--dump-single-json',
        '--no-playlist',
        '--skip-download',
        '--no-warnings',
        '--extractor-args',
        'youtube:player_client=android,web',
        '--retry-sleep',
        'exp=1:10',
        '--retries',
        '3',
        url,
      ];

      const proc = spawn(getYtDlpBinary(), args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          if (stderr.includes('429') || stderr.includes('Too Many Requests')) {
            return reject(new Error('YouTube rate-limited metadata lookup (HTTP 429). Please try again shortly or use the "Upload Video" tab.'));
          }
          return reject(new Error(`yt-dlp failed with code ${code}: ${stderr.substring(0, 250) || 'Unknown error'}`));
        }

        try {
          const json = JSON.parse(stdout);
          const info: VideoInfo = {
            id: json.id || ytId || 'unknown',
            title: json.title || 'Untitled YouTube Video',
            duration: Math.round(json.duration || 0),
            thumbnail: json.thumbnail || (json.thumbnails && json.thumbnails[0]?.url) || '',
            channel: json.uploader || json.channel || 'Unknown Channel',
            description: json.description ? json.description.substring(0, 300) : '',
            webpage_url: json.webpage_url || url,
            view_count: json.view_count || 0,
            tags: Array.isArray(json.tags) ? json.tags : [],
            categories: Array.isArray(json.categories) ? json.categories : [],
          };

          // Save info cache to disk for instant future lookups
          const sanitized = (info.id || '').replace(/[^a-zA-Z0-9_\-]/g, '');
          if (sanitized) {
            try {
              fs.writeFileSync(path.join(uploadsDir, `yt-${sanitized}.info.json`), JSON.stringify(info, null, 2));
            } catch {}
          }

          resolve(info);
        } catch (err: any) {
          reject(new Error(`Failed to parse YouTube metadata JSON: ${err.message}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to execute yt-dlp: ${err.message}`));
      });
    });
  },

  /**
   * Generate high-ranking viral hashtags tailored for YouTube Shorts, Reels, and TikTok
   */
  generateHashtags(info: VideoInfo): string[] {
    const rawTags: string[] = [];

    // 1. Channel name as tag
    if (info.channel) {
      const channelTag = info.channel.replace(/[^a-zA-Z0-9]/g, '');
      if (channelTag && channelTag.length > 2) {
        rawTags.push(`#${channelTag}`);
        rawTags.push(`#${channelTag}Shorts`);
      }
    }

    // 2. Significant title keywords and topic hashtags
    if (info.title) {
      // Full title condensed hashtag
      const condensedTitle = info.title.replace(/[^a-zA-Z0-9]/g, '');
      if (condensedTitle.length >= 4 && condensedTitle.length <= 25) {
        rawTags.push(`#${condensedTitle}`);
      }

      // Title individual keywords
      const titleWords = info.title
        .replace(/[^\w\s]/gi, ' ')
        .split(/\s+/)
        .filter(
          (w) =>
            w.length >= 3 &&
            !['with', 'from', 'this', 'that', 'what', 'when', 'where', 'have', 'been', 'about', 'and', 'the', 'for'].includes(
              w.toLowerCase()
            )
        );

      for (const word of titleWords.slice(0, 10)) {
        rawTags.push(`#${word.charAt(0).toUpperCase() + word.slice(1)}`);
      }
    }

    // 3. Existing tags from metadata
    if (info.tags && Array.isArray(info.tags)) {
      for (const t of info.tags) {
        if (typeof t === 'string' && t.trim()) {
          const clean = t.replace(/[^a-zA-Z0-9]/g, '');
          if (clean.length > 1 && clean.length < 25) {
            rawTags.push(`#${clean}`);
          }
        }
      }
    }

    // 4. Guaranteed high-traffic viral discovery tags for YouTube Shorts
    const ytShortsTags = [
      '#shorts',
      '#ytshorts',
      '#youtubeshorts',
      '#shortsfeed',
      '#viralshorts',
      '#shortsvideo',
      '#trendingshorts',
      '#shortsclip',
      '#shortsanity',
    ];

    // 5. High-traffic Instagram Reels algorithm tags
    const instaReelsTags = [
      '#reels',
      '#reelsinstagram',
      '#reelsvideo',
      '#viralreels',
      '#trendingreels',
      '#instareels',
      '#explorepage',
      '#reelitfeelit',
      '#reelsindia',
    ];

    // 6. High-traffic TikTok ForYou algorithm tags
    const tiktokTags = [
      '#fyp',
      '#foryou',
      '#foryoupage',
      '#viral',
      '#trending',
      '#tiktokviral',
      '#xyzbca',
      '#blowthisup',
      '#fypage',
    ];

    // 7. Audience reaction, comedy & entertainment tags
    const engagementTags = [
      '#comedy',
      '#podcast',
      '#podcastclips',
      '#reaction',
      '#mindblown',
      '#mustwatch',
      '#storytime',
      '#entertainment',
      '#hilarious',
      '#interview',
      '#unfiltered',
      '#relatable',
      '#epicmoments',
      '#funnymoments',
      '#clips',
      '#cinemiq',
    ];

    for (const v of [...ytShortsTags, ...instaReelsTags, ...tiktokTags, ...engagementTags]) {
      rawTags.push(v);
    }

    // Deduplicate case-insensitively while preserving original casing
    const seen = new Set<string>();
    const uniqueTags: string[] = [];
    for (const tag of rawTags) {
      const lower = tag.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        uniqueTags.push(tag);
      }
    }

    return uniqueTags.slice(0, 60);
  },

  /**
   * Start asynchronous download and AI analysis job
   */
  async startAnalysisJob(
    url: string,
    clipCount: number = 4,
    targetDuration: 'auto' | '15-30' | '30-60' = 'auto'
  ): Promise<string> {
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const job: ShortsJob = {
      id: jobId,
      url,
      status: 'pending',
      progress: 5,
      stage: 'Connecting to YouTube and initializing stream...',
    };
    activeJobs.set(jobId, job);

    // Run processing asynchronously in background
    this.processJob(jobId, url, clipCount, targetDuration).catch((err) => {
      console.error(`[ShortsJob ${jobId}] Failed:`, err);
      job.status = 'failed';
      job.error = err.message || 'Unknown processing error';
    });

    return jobId;
  },

  /**
   * Get current status of a job
   */
  getJobStatus(jobId: string): ShortsJob | null {
    return activeJobs.get(jobId) || null;
  },

  setJob(jobId: string, job: ShortsJob): void {
    activeJobs.set(jobId, job);
  },

  /**
   * Fetch subtitles for a YouTube URL or retrieve cached transcript
   */
  async fetchSubtitles(url: string, sanitizedId: string): Promise<TranscriptSegment[]> {
    const uploadsDir = getUploadsDir();
    const cacheFile = path.join(uploadsDir, `yt-${sanitizedId}.transcript.json`);

    // 1. Instant local disk cache check
    if (fs.existsSync(cacheFile)) {
      try {
        const raw = fs.readFileSync(cacheFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`⚡ [Shorts] Instant transcript cache hit: ${parsed.length} segments`);
          return parsed;
        }
      } catch {}
    }

    // 2. Also check if a .vtt file already exists on disk
    const existingVtt = fs.readdirSync(uploadsDir).find((f) => f.startsWith(`yt-${sanitizedId}`) && f.endsWith('.vtt'));
    if (existingVtt) {
      try {
        const segs = parseVTTFile(path.join(uploadsDir, existingVtt));
        if (segs.length > 0) {
          fs.writeFileSync(cacheFile, JSON.stringify(segs, null, 2));
          return segs;
        }
      } catch {}
    }

    // 3. Download subtitles using yt-dlp with resilient clients and 15s timeout
    try {
      const vttTemplate = path.join(uploadsDir, `yt-${sanitizedId}.%(ext)s`);
      const cookieArgs = getCookieArgs(uploadsDir);
      const args = [
        '--js-runtimes',
        'node',
        '--skip-download',
        '--write-auto-subs',
        '--write-subs',
        '--sub-langs',
        'all,-live_chat',
        '--sub-format',
        'vtt',
        '--no-playlist',
        '--no-warnings',
        '--extractor-args',
        'youtube:player_client=android,ios,mweb',
        '--user-agent',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        '--socket-timeout',
        '20',
        ...cookieArgs,
        '-o',
        vttTemplate,
        url,
      ];

      await new Promise<void>((resolve) => {
        const proc = spawn(getYtDlpBinary(), args, { windowsHide: true });
        const timer = setTimeout(() => {
          try {
            proc.kill();
          } catch {}
          resolve();
        }, 15000);

        proc.on('close', () => {
          clearTimeout(timer);
          resolve();
        });
        proc.on('error', () => {
          clearTimeout(timer);
          resolve();
        });
      });

      const foundVtt = fs.readdirSync(uploadsDir).find((f) => f.startsWith(`yt-${sanitizedId}`) && f.endsWith('.vtt'));
      if (foundVtt) {
        const segs = parseVTTFile(path.join(uploadsDir, foundVtt));
        if (segs.length > 0) {
          try {
            fs.writeFileSync(cacheFile, JSON.stringify(segs, null, 2));
          } catch {}
          console.log(`📝 [Shorts Subtitles] Successfully extracted ${segs.length} timestamped lines!`);
          return segs;
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Subtitle fetch skipped/failed:', err.message);
    }

    return [];
  },

  /**
   * Background processor: Downloads video + subtitles in a single unified pass,
   * extracts metadata and subtitles without triggering YouTube 429 rate limits,
   * and analyzes for viral hooks.
   */
  async processJob(
    jobId: string,
    url: string,
    clipCount: number,
    targetDuration: 'auto' | '15-30' | '30-60'
  ) {
    const job = activeJobs.get(jobId);
    if (!job) return;

    const jobStartTime = Date.now();
    const uploadsDir = getUploadsDir();

    // 1. Fetch metadata immediately (fast ~1-2 seconds)
    job.progress = 10;
    job.stage = 'Connecting to YouTube and reading video metadata...';

    let videoInfo: VideoInfo;
    try {
      videoInfo = await this.getVideoInfo(url);
      job.videoInfo = videoInfo;
      job.hashtags = this.generateHashtags(videoInfo);
    } catch (err: any) {
      console.warn('Metadata lookup fallback:', err.message);
      videoInfo = {
        id: jobId,
        title: 'YouTube Video',
        duration: 180,
        thumbnail: '',
        channel: 'YouTube',
        description: '',
        webpage_url: url,
      };
      job.videoInfo = videoInfo;
      job.hashtags = this.generateHashtags(videoInfo);
    }

    // 2. Fetch subtitles & transcript for sentence-accurate meaningful clips and kinetic lyrics
    job.progress = 20;
    job.stage = 'Extracting speech subtitles & dialogue sentences...';

    const sanitizedId = (videoInfo.id || jobId).replace(/[^a-zA-Z0-9_\-]/g, '');
    let transcript: TranscriptSegment[] = [];
    try {
      transcript = await this.fetchSubtitles(url, sanitizedId);
      job.transcript = transcript;
    } catch (err: any) {
      console.warn('Subtitle extraction note:', err.message);
    }

    // 3. Generate AI clips with sentence-snapped meaningful thoughts
    job.progress = 30;
    job.stage = transcript.length > 0
      ? `Analyzing ${transcript.length} speech dialogue lines for viral hooks...`
      : 'Scanning timeline & detecting high-retention viral moments...';

    const earlyClips = await this.detectViralMoments(
      videoInfo,
      transcript,
      clipCount,
      targetDuration
    );
    job.clips = earlyClips;
    job.generationTimeMs = Date.now() - jobStartTime;

    job.progress = 45;
    job.stage = `Identified ${earlyClips.length} viral highlights! Checking stream cache...`;

    // Check if we already have this video stream downloaded on disk (Instant 0s Local Cache)
    const currentFiles = fs.readdirSync(uploadsDir);
    let cachedVideo = currentFiles.find((f) => {
      const isMatch = f === `yt-${sanitizedId}.mp4` || (f.includes(sanitizedId) && (f.endsWith('.mp4') || f.endsWith('.webm')));
      if (!isMatch) return false;
      try {
        return fs.statSync(path.join(uploadsDir, f)).size > 1024 * 1024;
      } catch {
        return false;
      }
    });

    // Also check previous info.json files that map this YouTube ID to an existing video file
    if (!cachedVideo && videoInfo.id) {
      const infoFiles = currentFiles.filter((f) => f.endsWith('.info.json'));
      for (const infoName of infoFiles) {
        try {
          const raw = fs.readFileSync(path.join(uploadsDir, infoName), 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed.id === videoInfo.id) {
            const basePrefix = infoName.replace(/\.info\.json$/, '');
            const matchingVideo = currentFiles.find(
              (f) =>
                f.startsWith(basePrefix) &&
                (f.endsWith('.mp4') || f.endsWith('.webm')) &&
                fs.statSync(path.join(uploadsDir, f)).size > 1024 * 1024
            );
            if (matchingVideo) {
              cachedVideo = matchingVideo;
              break;
            }
          }
        } catch {}
      }
    }

    if (cachedVideo) {
      console.log(`⚡ [Shorts] Instant local cache hit! Reusing: ${cachedVideo}`);
      const finalVideoPath = path.join(uploadsDir, cachedVideo);
      job.videoPath = finalVideoPath;
      job.videoUrl = `/uploads/shorts/${cachedVideo}`;
      job.downloadTimeMs = 0;
      job.isCachedSource = true;
      job.progress = 100;
      job.stage = `Analysis complete in ${(job.generationTimeMs / 1000).toFixed(1)}s! Loaded from instant cache (${earlyClips.length} clips ready).`;
      job.status = 'done';
      return;
    }

    job.url = url;
    // 3. Fast progressive stream download with parallel connections & direct write
    job.status = 'downloading';
    job.stage = 'Clips ready! Caching high-speed stream for preview & export...';
    job.progress = 50;
    job.downloadStartTime = Date.now();

    await new Promise<void>((resolve, reject) => {
      const outputTemplate = path.join(uploadsDir, `yt-${sanitizedId}.%(ext)s`);
      const cookieArgs = getCookieArgs(uploadsDir);
      const dlArgs = [
        '--js-runtimes',
        'node',
        '--newline',
        '-N',
        '4',
        '--no-part',
        '--buffer-size',
        '2M',
        '--concurrent-fragments',
        '4',
        '-f',
        'best[ext=mp4][height<=720]/best[height<=720]/18/bestvideo[height<=720]+bestaudio/best',
        '--merge-output-format',
        'mp4',
        '--no-playlist',
        '--no-abort-on-error',
        '--extractor-args',
        'youtube:player_client=android,ios,mweb',
        '--user-agent',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        '--socket-timeout',
        '30',
        '--retry-sleep',
        'exp=1:10',
        '--retries',
        '3',
        ...cookieArgs,
        '-o',
        outputTemplate,
        url,
      ];

      const dlProc = spawn(getYtDlpBinary(), dlArgs, { windowsHide: true });
      let stderr = '';

      const parseProgressOutput = (rawText: string) => {
        const lines = rawText.split('\n');
        for (const line of lines) {
          // Format: [download]  14.2% of  218.53KiB at  567.63KiB/s ETA 00:00
          const fullMatch = line.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
          if (fullMatch) {
            const pct = parseFloat(fullMatch[1]);
            const totalSize = fullMatch[2];
            const speed = fullMatch[3];
            const eta = fullMatch[4];
            job.progress = Math.min(95, Math.round(50 + (pct * 0.45)));
            job.stage = `Downloading stream: ${pct.toFixed(0)}% • ${speed} (ETA ${eta})`;
            job.downloadProgress = {
              percent: pct,
              speed,
              totalSize,
              eta,
            };
            continue;
          }

          // Fallback simple percentage
          const pMatch = line.match(/(\d{1,3}\.\d)%/);
          if (pMatch) {
            const pct = parseFloat(pMatch[1]);
            job.progress = Math.min(95, Math.round(50 + (pct * 0.45)));
            job.stage = `Downloading video (${pct.toFixed(0)}%)...`;
            if (!job.downloadProgress) {
              job.downloadProgress = { percent: pct };
            } else {
              job.downloadProgress.percent = pct;
            }
          }
        }
      };

      dlProc.stdout.on('data', (data) => {
        parseProgressOutput(data.toString());
      });

      dlProc.stderr.on('data', (data) => {
        const errStr = data.toString();
        stderr += errStr;
        parseProgressOutput(errStr);
      });

      dlProc.on('close', (code) => {
        // Check if output video file was produced
        const potentialFiles = fs.readdirSync(uploadsDir).filter(
          (f) => f.startsWith(`yt-${sanitizedId}`) || f.startsWith(jobId)
        );
        const hasVideo = potentialFiles.some((f) => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv'));
        if (hasVideo) {
          resolve();
        } else {
          // If viral clips were already extracted by AI analysis, do not fail the job!
          // Exports will seamlessly use fast on-demand section downloads.
          if (earlyClips.length > 0 || (job.clips && job.clips.length > 0)) {
            console.warn(`[ShortsJob ${jobId}] Background stream finished without single MP4: ${stderr.substring(0, 150)}. Proceeding in on-demand section mode.`);
            resolve();
          } else if (stderr.includes('429') || stderr.includes('Too Many Requests')) {
            reject(new Error('YouTube rate-limited this request (HTTP 429). Please try again in a few moments, or use the "Upload Video" tab to process your file directly.'));
          } else {
            reject(new Error(`Video download failed: ${stderr.substring(0, 250) || 'Unknown error'}`));
          }
        }
      });

      dlProc.on('error', (err) => {
        if (earlyClips.length > 0 || (job.clips && job.clips.length > 0)) {
          console.warn(`[ShortsJob ${jobId}] Background dlProc error ignored (clips ready):`, err);
          resolve();
        } else {
          reject(err);
        }
      });
    });

    job.downloadEndTime = Date.now();
    job.downloadTimeMs = job.downloadEndTime - (job.downloadStartTime || jobStartTime);
    job.isCachedSource = false;

    // Locate downloaded video if available
    const updatedFiles = fs.readdirSync(uploadsDir);
    const videoFile = updatedFiles.find(
      (f) => (f.startsWith(`yt-${sanitizedId}`) || f.startsWith(jobId)) && (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv'))
    );
    if (videoFile) {
      const finalVideoPath = path.join(uploadsDir, videoFile);
      job.videoPath = finalVideoPath;
      job.videoUrl = `/uploads/shorts/${videoFile}`;
    }

    job.progress = 100;
    job.stage = `Analysis complete! All ${earlyClips.length} clips ready to preview and export.`;
    job.status = 'done';
  },

  /**
   * AI Analysis using OpenAI GPT or intelligent algorithmic sentence-snapped fallback
   * Strictly skips video intro & outro, eliminates duplicates, groups coherent speech paragraphs,
   * and removes all counter/number suffixes.
   */
  async detectViralMoments(
    info: VideoInfo,
    transcript: TranscriptSegment[],
    clipCount: number = 4,
    targetDuration: 'auto' | '15-30' | '30-60' = 'auto'
  ): Promise<ViralClip[]> {
    const openai = getOpenAI();
    const duration = info.duration > 0 ? info.duration : 180;

    // Desired min/max clip lengths
    let minLen = 18;
    let maxLen = 50;
    if (targetDuration === '15-30') {
      minLen = 15;
      maxLen = 30;
    } else if (targetDuration === '30-60') {
      minLen = 30;
      maxLen = 58;
    }

    // 1. Calculate Intro & Outro Skips (never count channel intros, sponsor plugs, or outro credits)
    let introSkip = 0;
    let outroSkip = 0;
    if (duration >= 600) {
      introSkip = Math.max(60, Math.min(150, Math.round(duration * 0.08)));
      outroSkip = Math.max(45, Math.min(90, Math.round(duration * 0.05)));
    } else if (duration >= 300) {
      introSkip = Math.max(40, Math.min(75, Math.round(duration * 0.08)));
      outroSkip = Math.max(30, Math.min(50, Math.round(duration * 0.05)));
    } else if (duration >= 120) {
      introSkip = 25;
      outroSkip = 20;
    } else if (duration >= 60) {
      introSkip = Math.round(duration * 0.1);
      outroSkip = Math.round(duration * 0.06);
    }

    const maxUsableTime = Math.max(introSkip + minLen + 5, duration - outroSkip);

    // 2. Filter transcript strictly within the core content window [introSkip, maxUsableTime]
    const coreTranscript = transcript.filter(
      (s) => s.start >= introSkip && s.end <= maxUsableTime && s.text && s.text.trim().length > 1
    );

    // 3. Cluster into continuous, meaningful dialogue paragraphs (20-38s each)
    // NEVER sample individual lines which fractures sentences into senseless gibberish!
    interface NarrativeSpeechBlock {
      start: number;
      end: number;
      text: string;
      firstSentence: string;
    }

    const speechBlocks: NarrativeSpeechBlock[] = [];
    let curBlockSegs: TranscriptSegment[] = [];

    for (const seg of coreTranscript) {
      if (curBlockSegs.length === 0) {
        curBlockSegs.push(seg);
        continue;
      }
      const lastSeg = curBlockSegs[curBlockSegs.length - 1];
      const blockStart = curBlockSegs[0].start;
      const blockDur = seg.end - blockStart;
      const gap = seg.start - lastSeg.end;

      const hasTerminal = /[.?!]$/.test(lastSeg.text.trim());
      if (blockDur >= 20 && (hasTerminal || gap > 1.5 || blockDur >= 38)) {
        const text = curBlockSegs.map((s) => s.text.trim()).join(' ');
        speechBlocks.push({
          start: curBlockSegs[0].start,
          end: lastSeg.end,
          text,
          firstSentence: curBlockSegs[0].text.trim(),
        });
        curBlockSegs = [seg];
      } else {
        curBlockSegs.push(seg);
      }
    }
    if (curBlockSegs.length > 0) {
      const lastSeg = curBlockSegs[curBlockSegs.length - 1];
      speechBlocks.push({
        start: curBlockSegs[0].start,
        end: lastSeg.end,
        text: curBlockSegs.map((s) => s.text.trim()).join(' '),
        firstSentence: curBlockSegs[0].text.trim(),
      });
    }

    // Try OpenAI if configured and we have valid speech blocks
    if (openai && speechBlocks.length > 0) {
      try {
        console.log(`🤖 [Shorts AI] Querying OpenAI for ${clipCount} viral clips across window ${introSkip}s-${Math.round(maxUsableTime)}s...`);

        // Sample whole narrative blocks if necessary (preserving entire stories/sentences)
        let sampledBlocks = speechBlocks;
        if (speechBlocks.length > 40) {
          const step = Math.ceil(speechBlocks.length / 40);
          sampledBlocks = speechBlocks.filter((_, idx) => idx % step === 0);
        }

        const transcriptText = sampledBlocks
          .map((b) => `[${Math.round(b.start)}s - ${Math.round(b.end)}s]\n${b.text}`)
          .join('\n\n');

        const prompt = `You are an elite YouTube Shorts, TikTok, and Instagram Reels editor.
Your mission is to select the top ${clipCount} most viral, addictive, high-retention moments from this video.
Ensure the clips are well distributed throughout the usable conversation.

Video Title: "${info.title}"
Total Duration: ${Math.round(duration)} seconds
USABLE CONTENT WINDOW: Strictly from ${Math.round(introSkip)}s to ${Math.round(maxUsableTime)}s.
Desired Clip Length: Between ${minLen} and ${maxLen} seconds.

CRITICAL RULES (MUST FOLLOW STRICTLY):
1. SKIP INTRO AND OUTRO: DO NOT pick any content before ${Math.round(introSkip)}s (channel intros, greetings, sponsor plugs) or after ${Math.round(maxUsableTime)}s (outro, credits, subscribe buttons).
2. ZERO DUPLICATE OR OVERLAPPING SHORTS: Every clip must cover a completely separate, unique timestamp range. Do NOT allow any two clips to overlap.
3. MEANINGFUL & COMPLETE THOUGHTS: Every clip MUST make complete sense independently. It must contain a clear setup, escalation/insight, and punchy conclusion. NEVER cut off mid-sentence or mid-thought.
4. NO NUMBERINGS IN TITLES OR HEADLINES: DO NOT include "#1", "#2", "Part 1", "Part 2", "Clip 1", or trailing numbers anywhere. Give every clip an authentic, punchy standalone title describing the actual moment.
5. Provide a virality score between 80 and 99.
6. Provide a punchy "suggestedHeadline" for the video overlay without any numbering (e.g. "WAIT TILL THE END 😱" or "HOW HE ACTUALLY DID IT 🔥").

Respond strictly with valid JSON conforming to this schema:
{
  "clips": [
    {
      "title": "Descriptive Standalone Title (NO numbers or parts)",
      "startTime": ${Math.round(introSkip + 15)},
      "endTime": ${Math.round(introSkip + 15 + minLen + 10)},
      "viralityScore": 96,
      "reason": "Why this moment retains viewer attention",
      "hook": "First spoken sentence or thought",
      "suggestedHeadline": "CAPS HEADLINE OVERLAY",
      "tags": ["#shorts", "#viral", "#podcast"]
    }
  ]
}

TRANSCRIPT:
${transcriptText}`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        });

        const raw = response.choices[0]?.message?.content;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.clips) && parsed.clips.length > 0) {
            const acceptedClips: ViralClip[] = [];

            for (const c of parsed.clips) {
              let start = Math.max(introSkip, parseFloat(c.startTime) || introSkip);
              let end = Math.min(maxUsableTime, parseFloat(c.endTime) || (start + minLen));
              if (end - start < minLen) {
                end = Math.min(maxUsableTime, start + minLen);
              }
              if (end - start > maxLen) {
                end = start + maxLen;
              }
              if (start >= maxUsableTime || end <= introSkip || end - start < 8) {
                continue;
              }

              // De-duplication check: reject if overlapping with any already accepted clip
              if (hasOverlapWithAccepted(start, end, acceptedClips, 4)) {
                console.log(`⏩ [Shorts AI] Skipping overlapping clip candidate (${start}s - ${end}s)`);
                continue;
              }

              const clipSegs = transcript.filter((s) => s.end > start && s.start < end);
              const clipDur = Math.max(8, end - start);

              // Speech metrics & pacing analysis
              const textContent = clipSegs.map((s) => s.text).join(' ');
              const words = textContent.split(/\s+/).filter(Boolean);
              const wordCount = words.length;
              const wpm = clipDur > 0 ? Math.round((wordCount / clipDur) * 60) : 135;
              const pacing =
                wpm >= 170
                  ? '⚡ Hyper-Fast & Punchy'
                  : wpm >= 140
                  ? '🔥 Fast & Dynamic'
                  : wpm >= 110
                  ? '🎯 Balanced & Engaging'
                  : '🧘 Dramatic & Deliberate';

              const engagementArchetypes = [
                '💬 High Debate / Comment Magnet',
                '🤯 Mind-Bending Revelation',
                '😂 Extreme Humor / Share Trigger',
                '👀 Curiosity Cliffhanger',
                '💡 Save & Bookmark Worthy',
                '🔥 Viral Hook Retention Peak',
              ];
              const engagementType = engagementArchetypes[acceptedClips.length % engagementArchetypes.length];

              const hookQuote = c.hook || (clipSegs[0]?.text ? `"${clipSegs[0].text}..."` : 'Opening hook from speech');
              const rawTitle = cleanClipTitle(c.title, 'Highlight Moment');
              const headline = cleanHeadline(c.suggestedHeadline || c.title, "DON'T MISS THIS ⚡");

              const rawKeywords = words
                .map((w) => w.replace(/[^a-zA-Z]/g, ''))
                .filter((w) => w.length >= 4 && !['this', 'that', 'with', 'from', 'have', 'were', 'what', 'then', 'they', 'just', 'there'].includes(w.toLowerCase()));
              const keyTopics = Array.from(new Set(rawKeywords)).slice(0, 5);

              const titleVariants = [
                rawTitle,
                headline,
                `Wait till you hear this part... 😱`,
              ];

              const channelTag = (info.channel || 'creator').replace(/[^a-zA-Z0-9]/g, '');
              const recommendedDescription = `🚨 Watch till the end: ${c.reason || 'This moment had everyone talking.'}\n\n"${hookQuote}"\n\n👇 What do you think about this? Let us know in the comments!\n\n#shorts #${channelTag} #viral #trending #reels #fyp`;

              acceptedClips.push({
                id: `clip-${acceptedClips.length + 1}-${Math.random().toString(36).substring(2, 6)}`,
                title: rawTitle,
                startTime: Math.round(start * 10) / 10,
                endTime: Math.round(end * 10) / 10,
                duration: Math.round(clipDur * 10) / 10,
                viralityScore: c.viralityScore || Math.floor(88 + Math.random() * 10),
                reason: c.reason || 'High emotional hook and retention curve.',
                hook: hookQuote,
                suggestedHeadline: headline,
                tags: Array.isArray(c.tags) && c.tags.length >= 8 ? c.tags : [
                  '#shorts',
                  '#viral',
                  '#trending',
                  '#reels',
                  '#fyp',
                  '#foryou',
                  ...(channelTag ? [`#${channelTag}`] : []),
                  ...keyTopics.map((k) => `#${k}`),
                  '#explore',
                  '#mustwatch',
                ],
                transcriptSegments: clipSegs,
                pacing,
                engagementType,
                wordCount,
                speechTempo: `${wpm} WPM`,
                recommendedDescription,
                titleVariants,
                keyTopics: keyTopics.length > 0 ? keyTopics : ['Viral', 'Moments', 'Trending'],
              });

              if (acceptedClips.length >= clipCount) break;
            }

            if (acceptedClips.length >= clipCount) {
              return acceptedClips;
            }

            // Fill missing slots algorithmically without duplicate clips or numberings
            const fillClips = this.generateAlgorithmicClips(
              info,
              transcript,
              clipCount,
              minLen,
              maxLen,
              acceptedClips,
              introSkip,
              maxUsableTime
            );
            return [...acceptedClips, ...fillClips].slice(0, clipCount);
          }
        }
      } catch (err: any) {
        console.warn('⚠️ OpenAI analysis failed or skipped, falling back to smart heuristic:', err.message);
      }
    }

    // Meaningful sentence-snapped algorithmic highlight partitioner
    console.log(`⚡ [Shorts AI] Generating ${clipCount} viral clips across ${introSkip}s-${Math.round(maxUsableTime)}s using sentence-snapped partitioner...`);
    return this.generateAlgorithmicClips(info, transcript, clipCount, minLen, maxLen, [], introSkip, maxUsableTime);
  },

  /**
   * Algorithmic highlight detector: extracts meaningful, complete thought segments
   * Snaps startTime to sentence openings and endTime to terminal punctuation (.?!)
   * Strictly excludes intro & outro, eliminates duplicates, and removes all numberings/parts.
   */
  generateAlgorithmicClips(
    info: VideoInfo,
    transcript: TranscriptSegment[],
    count: number,
    minLen: number,
    maxLen: number,
    existingClips: ViralClip[] = [],
    introSkipOverride?: number,
    maxUsableTimeOverride?: number
  ): ViralClip[] {
    const totalDuration = info.duration > 0 ? info.duration : 120;
    const clips: ViralClip[] = [];

    const archetypes = [
      {
        title: 'Cold Opening Hook 💥',
        headline: 'THEY NEVER SAW THIS COMING 😱',
        reason: 'Immediate curiosity gap in the conversation.',
        score: 98,
      },
      {
        title: 'Core Truth Revelation 💡',
        headline: 'WHAT NOBODY WANTS TO ADMIT 🤫',
        reason: 'Psychological intrigue and surprising viewpoint.',
        score: 97,
      },
      {
        title: 'Unfiltered Banter 😂',
        headline: 'EVERYONE LOST THEIR MINDS HERE 💀',
        reason: 'Peak comedic timing and viral shareability.',
        score: 95,
      },
      {
        title: 'The Heated Debate ⚡',
        headline: 'THINGS JUST GOT INTENSE 🥊',
        reason: 'High-stakes conflict that triggers debate in comments.',
        score: 94,
      },
      {
        title: 'Controversial Statement 🚨',
        headline: 'DID HE ACTUALLY JUST SAY THAT? 🤯',
        reason: 'Jaw-dropping remark with maximum replay value.',
        score: 96,
      },
      {
        title: 'Unexpected Plot Twist 🔄',
        headline: 'WAIT FOR THE SUDDEN TWIST 👀',
        reason: 'Complete narrative subversion that boosts watch time.',
        score: 93,
      },
      {
        title: 'Mid-Episode Showstopper 🌟',
        headline: 'THE BEST MOMENT OF THE SHOW 🔥',
        reason: 'Highest energy moment of the entire discussion.',
        score: 95,
      },
      {
        title: 'The Wild Room Reaction 🤯',
        headline: 'THE ENTIRE ROOM COLLAPSED 🤣',
        reason: 'Viral crowd reaction and explosive laughter.',
        score: 92,
      },
      {
        title: 'Hidden Secret Exposed 🗝️',
        headline: 'THE SECRET THEY TRIED TO HIDE 🤐',
        reason: 'Exclusive behind-the-scenes insider knowledge.',
        score: 94,
      },
      {
        title: 'Savage Mic Drop 🎯',
        headline: 'THE COLDEST COMEBACK EVER 💀',
        reason: 'Instant punchline payoff with replay momentum.',
        score: 93,
      },
      {
        title: 'High Tension Silence ⏱️',
        headline: 'YOU COULD HEAR A PIN DROP 🥶',
        reason: 'Dramatic suspension and suspenseful pacing.',
        score: 91,
      },
      {
        title: 'Unbelievable Story Time 📖',
        headline: 'THE CRAZIEST STORY YOU WILL HEAR 📖',
        reason: 'Addictive narrative flow with strong cliffhanger.',
        score: 94,
      },
      {
        title: 'Emotional Raw Moment ❤️',
        headline: 'THIS HIT DIFFERENT TO EVERYONE 🥺',
        reason: 'Authentic vulnerability that connects deeply with viewers.',
        score: 90,
      },
      {
        title: 'Million Dollar Advice 🧠',
        headline: 'REMEMBER THIS PIECE OF ADVICE 💰',
        reason: 'High utility value that viewers save and bookmark.',
        score: 95,
      },
      {
        title: 'Pure Chaos Unleashed 🌪️',
        headline: 'WHEN EVERYTHING WENT OFF THE RAILS 🚨',
        reason: 'Unpredictable spontaneous chaos.',
        score: 92,
      },
      {
        title: 'The Ultimate Rebuttal ⚔️',
        headline: 'HOW TO END AN ENTIRE ARGUMENT 💥',
        reason: 'Decisive rhetoric and sharp logical checkmate.',
        score: 91,
      },
      {
        title: 'The Shocking Verdict ⚖️',
        headline: 'THE DECISION NOBODY EXPECTED 😱',
        reason: 'Suspenseful judgment and ultimate reaction.',
        score: 93,
      },
      {
        title: 'Final Golden Nugget 🎯',
        headline: 'PAY CLOSE ATTENTION TO THIS TAKEAWAY 🎯',
        reason: 'Actionable conclusion that drives comment engagement.',
        score: 88,
      },
      {
        title: 'Audience Favorite Highlight 💎',
        headline: 'EVERYONE IS TALKING ABOUT THIS PART 🔥',
        reason: 'Identified as a high-density keyword moment.',
        score: 91,
      },
      {
        title: 'Unfiltered Reality ⚡',
        headline: 'THE HARSH REALITY WE MUST FACE ⚡',
        reason: 'No-nonsense direct breakdown of the situation.',
        score: 89,
      },
      {
        title: 'Bonus Viral Moment 🎬',
        headline: 'THE PART THEY ALMOST CUT OUT 💀',
        reason: 'Exclusive candid humor and behind-the-scenes charm.',
        score: 90,
      },
    ];

    // Calculate intro and outro skip bounds
    let introSkip = introSkipOverride ?? 0;
    let maxUsableTime = maxUsableTimeOverride ?? totalDuration;

    if (introSkipOverride === undefined) {
      if (totalDuration >= 600) {
        introSkip = Math.max(60, Math.min(150, Math.round(totalDuration * 0.08)));
        maxUsableTime = totalDuration - Math.max(45, Math.min(90, Math.round(totalDuration * 0.05)));
      } else if (totalDuration >= 300) {
        introSkip = Math.max(40, Math.min(75, Math.round(totalDuration * 0.08)));
        maxUsableTime = totalDuration - Math.max(30, Math.min(50, Math.round(totalDuration * 0.05)));
      } else if (totalDuration >= 120) {
        introSkip = 25;
        maxUsableTime = totalDuration - 20;
      }
    }

    const usableDuration = Math.max(10, maxUsableTime - introSkip - minLen);
    const needed = Math.max(1, count - existingClips.length);
    const step = needed > 1 ? usableDuration / (needed + 1) : usableDuration / 2;

    for (let i = 0; i < needed * 3 && clips.length < needed; i++) {
      const template = archetypes[(existingClips.length + clips.length) % archetypes.length];
      const targetLength = Math.min(maxLen, Math.max(minLen, 24 + ((i * 5) % 25)));

      let rawStart = Math.round(introSkip + (i * (step * 0.75)));
      if (rawStart + targetLength > maxUsableTime) {
        rawStart = Math.max(introSkip, maxUsableTime - targetLength);
      }
      let rawEnd = Math.min(maxUsableTime, rawStart + targetLength);

      let snappedStart = rawStart;
      let snappedEnd = rawEnd;
      let clipSegments: TranscriptSegment[] = [];

      // Meaningful Slicing: Snap to natural sentence beginnings and ends
      if (transcript && transcript.length > 0) {
        // Find segment starting closest to rawStart with sentence start preference
        const nearbyStarts = transcript.filter((t) => t.start >= introSkip && Math.abs(t.start - rawStart) <= 10);
        if (nearbyStarts.length > 0) {
          const bestStart =
            nearbyStarts.find((s, idx) => {
              if (idx > 0) {
                const prev = nearbyStarts[idx - 1];
                if (/[.?!]$/.test(prev.text.trim()) || s.start - prev.end > 0.8) return true;
              }
              return /^[A-Z]/.test(s.text.trim());
            }) || nearbyStarts[0];
          snappedStart = Math.max(introSkip, bestStart.start);
        }

        const minTargetEnd = snappedStart + minLen;
        const maxTargetEnd = Math.min(maxUsableTime, snappedStart + maxLen);
        const nearbyEnds = transcript.filter((t) => t.end >= minTargetEnd && t.end <= maxTargetEnd + 5);

        if (nearbyEnds.length > 0) {
          const bestEnd =
            nearbyEnds.find((s) => /[.?!]$/.test(s.text.trim())) ||
            nearbyEnds[nearbyEnds.length - 1];
          snappedEnd = Math.min(maxUsableTime, bestEnd.end);
        } else {
          snappedEnd = Math.min(maxUsableTime, snappedStart + targetLength);
        }

        clipSegments = transcript.filter((t) => t.start >= snappedStart && t.end <= snappedEnd);
      }

      // Check for overlap against both existing clips and newly added algorithmic clips
      if (hasOverlapWithAccepted(snappedStart, snappedEnd, [...existingClips, ...clips], 4)) {
        continue;
      }

      // If no speech segments exist (e.g. music video), synthesize rhythmic lyrical cues
      if (clipSegments.length === 0) {
        const headlineWords = `${template.headline} • ${(info.title || 'CINEMIQ').toUpperCase()}`.split(/\s+/).filter(Boolean);
        const synthDur = Math.max(10, snappedEnd - snappedStart);
        const chunkCount = Math.max(2, Math.floor(synthDur / 4));
        const wordsPerChunk = Math.max(3, Math.ceil(headlineWords.length / chunkCount));

        for (let cIdx = 0; cIdx < chunkCount; cIdx++) {
          const cStart = Math.round((snappedStart + (cIdx * (synthDur / chunkCount))) * 100) / 100;
          const cEnd = Math.round((cStart + (synthDur / chunkCount) * 0.9) * 100) / 100;
          const cSlice = headlineWords.slice(
            (cIdx * wordsPerChunk) % headlineWords.length,
            ((cIdx + 1) * wordsPerChunk) % headlineWords.length || headlineWords.length
          );
          if (cSlice.length === 0) continue;

          const wDur = (cEnd - cStart) / cSlice.length;
          clipSegments.push({
            start: cStart,
            end: cEnd,
            text: cSlice.join(' '),
            words: cSlice.map((w, wIdx) => ({
              word: w,
              start: Math.round((cStart + wIdx * wDur) * 100) / 100,
              end: Math.round((cStart + (wIdx + 1) * wDur) * 100) / 100,
            })),
          });
        }
      }

      // Extract opening hook from the first spoken sentence
      let hook = 'Listen closely to what happens right here...';
      if (clipSegments.length > 0 && clipSegments[0].text) {
        hook = `"${clipSegments[0].text}..."`;
      }

      const clipDur = Math.max(5, snappedEnd - snappedStart);

      // Speech metrics & pacing analysis
      const fullText = clipSegments.map((s) => s.text).join(' ');
      const words = fullText.split(/\s+/).filter(Boolean);
      const wordCount = words.length;
      const wpm = clipDur > 0 ? Math.round((wordCount / clipDur) * 60) : 135;
      const pacing =
        wpm >= 170
          ? '⚡ Hyper-Fast & Punchy'
          : wpm >= 140
          ? '🔥 Fast & Dynamic'
          : wpm >= 105
          ? '🎯 Balanced & Engaging'
          : '🧘 Dramatic & Deliberate';

      const engagementTypes = [
        '💬 High Debate / Comment Magnet',
        '🤯 Mind-Bending Revelation',
        '😂 Extreme Humor / Share Trigger',
        '👀 Curiosity Cliffhanger',
        '💡 Save & Bookmark Worthy',
        '🔥 Viral Hook Retention Peak',
        '⚡ High-Pace Punchline Payoff',
        '🚨 Jaw-Dropping Reality Check',
      ];
      const engagementType = engagementTypes[(existingClips.length + clips.length) % engagementTypes.length];

      // Clean topic keywords from speech & title
      const rawTopics = words
        .map((w) => w.replace(/[^a-zA-Z]/g, ''))
        .filter(
          (w) =>
            w.length >= 4 &&
            !['with', 'from', 'this', 'that', 'what', 'when', 'where', 'have', 'been', 'about', 'just', 'there', 'their'].includes(
              w.toLowerCase()
            )
        );
      const keyTopics = Array.from(new Set(rawTopics)).slice(0, 5);

      // Derive dynamic title based on spoken speech hook or archetype (NO numberings)
      let dynamicTitle = template.title;
      if (clipSegments.length > 0 && clipSegments[0].text) {
        const spokenWords = clipSegments[0].text
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .trim()
          .split(/\s+/)
          .slice(0, 6)
          .join(' ');
        if (spokenWords.length >= 10 && spokenWords.length <= 45) {
          dynamicTitle = `${spokenWords} ⚡`;
        }
      }
      const finalTitle = cleanClipTitle(dynamicTitle, template.title);
      const finalHeadline = cleanHeadline(template.headline, 'MUST WATCH 🔥');

      // Clean Title Variants without any numbers or part numbers
      const titleVariants = [
        finalTitle,
        finalHeadline,
        `Wait till you hear this part... 😱`,
      ];

      const channelTag = (info.channel || 'creator').replace(/[^a-zA-Z0-9]/g, '');
      const recommendedDescription = `🚨 ${finalHeadline}\n\n"${hook}"\n\n📌 Breakdown: ${template.reason}\n\n👇 Drop your thoughts below!\n\n#shorts #${channelTag} #viral #trending #reels #fyp #mindblown #podcast`;

      // 12-16 tailored tags per clip
      const clipTags = [
        '#shorts',
        '#viral',
        '#trending',
        '#reels',
        '#fyp',
        '#foryou',
        `#${template.title.replace(/[^a-zA-Z0-9]/g, '')}`,
        ...(channelTag ? [`#${channelTag}`] : []),
        ...keyTopics.map((k) => `#${k}`),
        '#cinemiq',
        '#explorepage',
        '#mustwatch',
      ].filter((t, idx, arr) => t.length > 2 && arr.indexOf(t) === idx);

      clips.push({
        id: `clip-${existingClips.length + clips.length + 1}-${Math.random().toString(36).substring(2, 6)}`,
        title: finalTitle,
        startTime: Math.round(snappedStart * 10) / 10,
        endTime: Math.round(snappedEnd * 10) / 10,
        duration: Math.round(clipDur * 10) / 10,
        viralityScore: Math.max(78, template.score - Math.floor((clips.length % archetypes.length) * 0.3)),
        reason: template.reason,
        hook,
        suggestedHeadline: finalHeadline,
        tags: clipTags,
        transcriptSegments: clipSegments,
        pacing,
        engagementType,
        wordCount,
        speechTempo: `${wpm} WPM`,
        recommendedDescription,
        titleVariants,
        keyTopics: keyTopics.length > 0 ? keyTopics : ['Trending', 'Highlights', 'Viral'],
      });
    }

    return clips;
  },

  /**
   * Render a customized short clip using FFmpeg
   * Supports: 9:16 Blurred Background, 9:16 Center Crop, 16:9 Fit, Headline Text Overlay,
   * Kinetic Motion Graphic Subtitles (Hormozi, Neon, MrBeast, Karaoke, Minimal),
   * and Copyright-Free Background Music with Sidechain Auto-Ducking!
   */
  async renderShortClip(params: {
    sourceVideoPath: string;
    startTime: number;
    endTime: number;
    aspectRatio: '9:16-blur' | '9:16-crop' | '16:9-fit' | 'original';
    headlineText?: string;
    targetResolution?: '720p' | '1080p';
    captionStyle?: CaptionStyle;
    transcriptSegments?: TranscriptSegment[];
    bgMusicTrack?: string;
    bgMusicVolume?: number;
    autoDucking?: boolean;
  }): Promise<{ url: string; duration: number; filePath: string }> {
    const {
      sourceVideoPath,
      startTime,
      endTime,
      aspectRatio,
      headlineText,
      captionStyle = 'none',
      transcriptSegments = [],
      bgMusicTrack = 'none',
      bgMusicVolume = 0.2,
      autoDucking = true,
    } = params;

    if (!fs.existsSync(sourceVideoPath)) {
      throw new Error(`Source video not found on disk: ${sourceVideoPath}`);
    }

    const duration = Math.max(1, endTime - startTime);
    const uploadsDir = getUploadsDir();

    const is1080p = params.targetResolution === '1080p';
    const targetW = is1080p ? 1080 : 720;
    const targetH = is1080p ? 1920 : 1280;
    const bgScale = is1080p ? '90:160' : '72:128';
    const fontSize = is1080p ? 48 : 34;
    const textY = is1080p ? 240 : 160;

    // Font selection on Windows
    let fontArg = '';
    if (fs.existsSync('C:\\Windows\\Fonts\\arialbd.ttf')) {
      fontArg = ":fontfile='C\\:/Windows/Fonts/arialbd.ttf'";
    } else if (fs.existsSync('C:\\Windows\\Fonts\\arial.ttf')) {
      fontArg = ":fontfile='C\\:/Windows/Fonts/arial.ttf'";
    }

    const cleanHeadline = (headlineText || '')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .trim();

    // Check fast render cache in memory
    const cacheKey = `${sourceVideoPath}_${startTime}_${endTime}_${aspectRatio}_${cleanHeadline}_${params.targetResolution || '720p'}_${captionStyle}_${bgMusicTrack}_${bgMusicVolume}_${autoDucking}`;
    const cached = renderCache.get(cacheKey);
    if (cached && fs.existsSync(cached.filePath)) {
      return cached;
    }

    // Check persistent disk cache by deterministic hash
    const keyHash = crypto.createHash('md5').update(cacheKey).digest('hex').substring(0, 12);
    const outputFilename = `short-${params.targetResolution || '720p'}-${keyHash}.mp4`;
    const outputPath = path.join(uploadsDir, outputFilename);

    if (fs.existsSync(outputPath)) {
      try {
        const stat = fs.statSync(outputPath);
        if (stat.size > 10000) {
          const diskCached = {
            url: `/uploads/shorts/${outputFilename}`,
            duration,
            filePath: outputPath,
          };
          renderCache.set(cacheKey, diskCached);
          return diskCached;
        }
      } catch {}
    }

    // Generate kinetic ASS subtitle file if caption style requested
    let assFilePath: string | null = null;
    if (captionStyle && captionStyle !== 'none' && transcriptSegments && transcriptSegments.length > 0) {
      assFilePath = generateAssSubtitles({
        segments: transcriptSegments,
        clipStartTime: startTime,
        clipEndTime: endTime,
        style: captionStyle,
        targetResolution: params.targetResolution,
        uploadsDir,
      });
    }

    // Check background music file
    let hasBgMusic = false;
    let musicFilePath = '';
    if (bgMusicTrack && bgMusicTrack !== 'none') {
      const candidates = [
        path.join(getMusicDir(), `${bgMusicTrack}.mp3`),
        path.join(getUploadsDir(), 'music', `${bgMusicTrack}.mp3`),
        path.resolve(process.cwd(), 'uploads', 'music', `${bgMusicTrack}.mp3`),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          musicFilePath = c;
          hasBgMusic = true;
          break;
        }
      }
    }

    // Build video filter graph
    let filterComplex = '';
    if (aspectRatio === '9:16-blur') {
      filterComplex =
        '[0:v]split=2[in1][in2];' +
        `[in1]scale=${bgScale}:flags=fast_bilinear:force_original_aspect_ratio=increase,crop=${bgScale},boxblur=3:1,scale=${targetW}:${targetH}:flags=fast_bilinear[bg];` +
        `[in2]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease:flags=fast_bilinear[fg];` +
        '[bg][fg]overlay=(W-w)/2:(H-h)/2:eval=init[v_framed]';
    } else if (aspectRatio === '9:16-crop') {
      filterComplex = `[0:v]crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=${targetW}:${targetH}:flags=fast_bilinear[v_framed]`;
    } else if (aspectRatio === '16:9-fit') {
      filterComplex = `[0:v]scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black[v_framed]`;
    } else {
      filterComplex = '[0:v]null[v_framed]';
    }

    // Add Headline Banner
    if (cleanHeadline) {
      filterComplex += `;[v_framed]drawtext=text='${cleanHeadline}'${fontArg}:fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.65:boxborderw=16:x=(w-text_w)/2:y=${textY}[v_titled]`;
    } else {
      filterComplex += ';[v_framed]null[v_titled]';
    }

    // Add Kinetic Subtitles via libass
    if (assFilePath && fs.existsSync(assFilePath)) {
      const escapedAss = assFilePath.replace(/\\/g, '/').replace(/:/g, '\\:');
      filterComplex += `;[v_titled]subtitles='${escapedAss}'[v]`;
    } else {
      filterComplex += ';[v_titled]null[v]';
    }

    // Build audio filter graph if background music is requested
    const effectiveMusicVol = Math.max(0.01, Math.min(1, bgMusicVolume || 0.2));
    if (hasBgMusic) {
      if (autoDucking) {
        // Dialogue in [0:a] triggers sidechain compression on background music [1:a]
        filterComplex +=
          `;[1:a]aloop=loop=-1:size=2e+09,volume=${effectiveMusicVol}[bgm];` +
          '[bgm][0:a]sidechaincompress=threshold=0.08:ratio=4:attack=20:release=350[ducked_bgm];' +
          '[0:a][ducked_bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]';
      } else {
        filterComplex +=
          `;[1:a]aloop=loop=-1:size=2e+09,volume=${effectiveMusicVol}[bgm];` +
          '[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]';
      }
    }

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg()
        .input(sourceVideoPath)
        .inputOptions([`-ss ${startTime}`]);

      if (hasBgMusic) {
        cmd.input(musicFilePath);
        cmd.complexFilter(filterComplex, ['v', 'aout']);
        cmd.outputOptions([
          `-t ${duration}`,
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 23',
          '-tune fastdecode',
          '-x264-params no-scenecut=1:ref=1:me=dia:subme=0:b-adapt=0',
          '-threads 0',
          '-c:a aac',
          '-b:a 128k',
          '-ar 44100',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
        ]);
      } else {
        cmd.complexFilter(filterComplex, ['v']);
        cmd.outputOptions([
          `-t ${duration}`,
          '-map 0:a?',
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 23',
          '-tune fastdecode',
          '-x264-params no-scenecut=1:ref=1:me=dia:subme=0:b-adapt=0',
          '-threads 0',
          '-c:a aac',
          '-b:a 128k',
          '-ar 44100',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
        ]);
      }

      cmd.output(outputPath);

      cmd.on('end', () => {
        // Clean up temporary ASS file
        if (assFilePath && fs.existsSync(assFilePath)) {
          try {
            fs.unlinkSync(assFilePath);
          } catch {}
        }

        const result = {
          url: `/uploads/shorts/${outputFilename}`,
          duration,
          filePath: outputPath,
        };
        renderCache.set(cacheKey, result);
        resolve(result);
      });

      cmd.on('error', (err, stdout, stderr) => {
        if (assFilePath && fs.existsSync(assFilePath)) {
          try {
            fs.unlinkSync(assFilePath);
          } catch {}
        }
        console.error('FFmpeg Shorts Render Error:', err.message, stderr);
        reject(new Error(`Rendering failed: ${err.message}`));
      });

      console.log('FFmpeg Arguments:', (cmd as any)._getArguments());
      cmd.run();
    });
  },

  /**
   * Fast on-demand download of a specific video time range (e.g. 15-30s)
   * Completes in ~1-2 seconds without downloading full-length video
   */
  async downloadClipSection(params: {
    url: string;
    startTime: number;
    endTime: number;
  }): Promise<string> {
    const { url, startTime, endTime } = params;
    const uploadsDir = getUploadsDir();
    const cleanId = (extractYouTubeId(url) || 'clip').replace(/[^a-zA-Z0-9_\-]/g, '');
    const hash = crypto.createHash('md5').update(`${url}_${startTime}_${endTime}`).digest('hex').substring(0, 8);
    const outputPath = path.join(uploadsDir, `sec-${cleanId}-${hash}.mp4`);

    if (fs.existsSync(outputPath)) {
      try {
        if (fs.statSync(outputPath).size > 10000) return outputPath;
      } catch {}
    }

    const startSec = Math.max(0, Math.floor(startTime));
    const endSec = Math.max(startSec + 1, Math.ceil(endTime));
    const startStr = new Date(startSec * 1000).toISOString().substring(11, 19);
    const endStr = new Date(endSec * 1000).toISOString().substring(11, 19);

    const cookieArgs = getCookieArgs(uploadsDir);
    const args = [
      '--js-runtimes',
      'node',
      '--newline',
      '--download-sections',
      `*${startStr}-${endStr}`,
      '-f',
      'best[ext=mp4][height<=720]/best[height<=720]/18/best',
      '--no-playlist',
      '--no-abort-on-error',
      '--extractor-args',
      'youtube:player_client=android,ios,mweb',
      '--user-agent',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      '--socket-timeout',
      '30',
      '--retry-sleep',
      'exp=1:10',
      '--retries',
      '3',
      ...cookieArgs,
      '-o',
      outputPath,
      url,
    ];

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(getYtDlpBinary(), args, { windowsHide: true });
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('close', (code) => {
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
          resolve();
        } else {
          reject(new Error(`Failed to download clip section: ${stderr.substring(0, 200)}`));
        }
      });
      proc.on('error', (err) => reject(err));
    });

    return outputPath;
  },

  /**
   * Render and package all clips from a job into a single ZIP archive
   */
  async renderAllClipsZip(params: {
    jobId: string;
    youtubeUrl?: string;
    aspectRatio?: '9:16-blur' | '9:16-crop' | '16:9-fit' | 'original';
    targetResolution?: '720p' | '1080p';
    captionStyle?: CaptionStyle;
    bgMusicTrack?: string;
    bgMusicVolume?: number;
    autoDucking?: boolean;
    customHeadlines?: Record<string, string>;
    clipTrims?: Record<string, { start: number; end: number }>;
  }): Promise<{ zipUrl: string; totalClips: number; zipFilename: string }> {
    const job = activeJobs.get(params.jobId);
    if (!job) {
      throw new Error(`Job not found for ID: ${params.jobId}. Please re-run analysis.`);
    }

    const uploadsDir = getUploadsDir();

    // Check if videoPath exists; self-heal from disk if needed
    if (!job.videoPath || !fs.existsSync(job.videoPath)) {
      const currentFiles = fs.readdirSync(uploadsDir);
      const sanitizedId = (job.videoInfo?.id || params.jobId).replace(/[^a-zA-Z0-9_\-]/g, '');
      const matched = currentFiles.find(
        (f) =>
          (f.includes(sanitizedId) || f.includes(params.jobId)) &&
          (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')) &&
          !f.startsWith('short-') &&
          !f.startsWith('sec-')
      );
      if (matched) {
        job.videoPath = path.join(uploadsDir, matched);
      }
    }

    const targetUrl =
      params.youtubeUrl ||
      job.url ||
      job.videoInfo?.webpage_url ||
      (job.videoInfo?.id ? `https://www.youtube.com/watch?v=${job.videoInfo.id}` : null);

    if ((!job.videoPath || !fs.existsSync(job.videoPath)) && !targetUrl) {
      throw new Error(`Source video is not available on disk and no YouTube URL was found for ID: ${params.jobId}`);
    }

    const clips = job.clips || [];
    if (clips.length === 0) {
      throw new Error('No clips available in this job to export');
    }

    const aspectRatio = params.aspectRatio || '9:16-blur';
    const zipFilename = `cinemiq-shorts-${params.jobId}.zip`;
    const zipPath = path.join(uploadsDir, zipFilename);

    // If zip was already generated recently and exists, return immediately
    if (fs.existsSync(zipPath)) {
      const stats = fs.statSync(zipPath);
      if (Date.now() - stats.mtimeMs < 300000) {
        return {
          zipUrl: `/uploads/shorts/${zipFilename}`,
          totalClips: clips.length,
          zipFilename,
        };
      }
    }

    // Adaptive concurrency: 2 on cloud/Linux (to prevent OOM on 512MB RAM), 4 on Windows
    const isCloudEnv = process.platform !== 'win32' || Boolean(process.env.RENDER) || process.env.NODE_ENV === 'production';
    const chunkSize = isCloudEnv ? 2 : 4;
    const renderedFiles: Array<{ title: string; filePath: string }> = [];

    for (let i = 0; i < clips.length; i += chunkSize) {
      const chunk = clips.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (clip, idx) => {
          const clipIndex = i + idx;
          const trim = params.clipTrims?.[clip.id];
          const startTime = trim?.start ?? clip.startTime;
          const endTime = trim?.end ?? clip.endTime;
          const headlineText = params.customHeadlines?.[clip.id] ?? clip.suggestedHeadline ?? '';

          let clipSource = job.videoPath && fs.existsSync(job.videoPath) ? job.videoPath : null;
          let renderStart = startTime;
          let renderEnd = endTime;

          // If full video is still buffering in background, download only this 15-30s section in ~1-2s!
          if (!clipSource) {
            console.log(`⚡ [Shorts ZIP] Fast on-demand section download for clip ${clipIndex + 1} (${startTime}s -> ${endTime}s)...`);
            clipSource = await this.downloadClipSection({
              url: targetUrl!,
              startTime,
              endTime,
            });
            renderStart = 0;
            renderEnd = Math.max(1, endTime - startTime);
          }

          const res = await this.renderShortClip({
            sourceVideoPath: clipSource,
            startTime: renderStart,
            endTime: renderEnd,
            aspectRatio,
            headlineText,
            targetResolution: params.targetResolution,
            captionStyle: params.captionStyle,
            transcriptSegments: clip.transcriptSegments || job.transcript || [],
            bgMusicTrack: params.bgMusicTrack,
            bgMusicVolume: params.bgMusicVolume,
            autoDucking: params.autoDucking,
          });

          return {
            title: cleanClipTitle(clip.title, 'Highlight'),
            filePath: res.filePath,
          };
        })
      );
      renderedFiles.push(...results);
    }

    // Package all rendered clips into a zip archive with full title names
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      let archive: any;
      if (typeof (archiverModule as any).ZipArchive === 'function') {
        archive = new (archiverModule as any).ZipArchive({ zlib: { level: 4 } });
      } else if (typeof (archiverModule as any).default === 'function') {
        archive = (archiverModule as any).default('zip', { zlib: { level: 4 } });
      } else if (typeof (archiverModule as any) === 'function') {
        archive = (archiverModule as any)('zip', { zlib: { level: 4 } });
      } else {
        return reject(new Error('Zip archiver module is not available'));
      }

      output.on('close', () => resolve());
      archive.on('error', (err: any) => reject(err));

      archive.pipe(output);

      const usedNames = new Set<string>();
      for (let idx = 0; idx < renderedFiles.length; idx++) {
        const item = renderedFiles[idx];
        let cleanName = cleanClipTitle(item.title, 'Highlight')
          .replace(/[\\/:*?"<>|#]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (cleanName.length > 100) cleanName = cleanName.substring(0, 100).trim();
        let entryName = `${cleanName}.mp4`;
        if (usedNames.has(entryName.toLowerCase())) {
          entryName = `${cleanName} - Highlight.mp4`;
        }
        usedNames.add(entryName.toLowerCase());

        archive.file(item.filePath, { name: entryName });
      }

      archive.finalize();
    });

    return {
      zipUrl: `/uploads/shorts/${zipFilename}`,
      totalClips: renderedFiles.length,
      zipFilename,
    };
  },

  /**
   * Render and save all clips into a dedicated directory on disk (no zip),
   * returning clean direct file URLs for browser folder streaming or direct access.
   */
  async exportAllClipsFolder(params: {
    jobId: string;
    youtubeUrl?: string;
    aspectRatio?: '9:16-blur' | '9:16-crop' | '16:9-fit' | 'original';
    targetResolution?: '720p' | '1080p';
    captionStyle?: CaptionStyle;
    bgMusicTrack?: string;
    bgMusicVolume?: number;
    autoDucking?: boolean;
    customHeadlines?: Record<string, string>;
    clipTrims?: Record<string, { start: number; end: number }>;
  }): Promise<{
    folderName: string;
    folderPath: string;
    totalClips: number;
    clips: Array<{ title: string; filename: string; url: string; duration: number }>;
    zipUrl?: string;
    zipFilename?: string;
  }> {
    const job = activeJobs.get(params.jobId);
    if (!job) {
      throw new Error(`Job not found for ID: ${params.jobId}. Please re-run analysis.`);
    }

    const uploadsDir = getUploadsDir();

    // Check if job.videoPath exists; self-heal from disk if needed
    if (!job.videoPath || !fs.existsSync(job.videoPath)) {
      const currentFiles = fs.readdirSync(uploadsDir);
      const sanitizedId = (job.videoInfo?.id || params.jobId).replace(/[^a-zA-Z0-9_\-]/g, '');
      const matched = currentFiles.find(
        (f) =>
          (f.includes(sanitizedId) || f.includes(params.jobId)) &&
          (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')) &&
          !f.startsWith('short-') &&
          !f.startsWith('sec-')
      );
      if (matched) {
        job.videoPath = path.join(uploadsDir, matched);
      }
    }

    const targetUrl =
      params.youtubeUrl ||
      job.url ||
      job.videoInfo?.webpage_url ||
      (job.videoInfo?.id ? `https://www.youtube.com/watch?v=${job.videoInfo.id}` : null);

    if ((!job.videoPath || !fs.existsSync(job.videoPath)) && !targetUrl) {
      throw new Error(`Source video is not available on disk and no YouTube URL was found for ID: ${params.jobId}`);
    }

    const clips = job.clips || [];
    if (clips.length === 0) {
      throw new Error('No clips available in this job to export');
    }

    const aspectRatio = params.aspectRatio || '9:16-blur';
    const folderName = `${params.jobId}-shorts`;
    const folderPath = path.join(uploadsDir, folderName);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Adaptive concurrency: 2 on cloud/Linux (to prevent OOM on 512MB RAM), 4 on Windows
    const isCloudEnv = process.platform !== 'win32' || Boolean(process.env.RENDER) || process.env.NODE_ENV === 'production';
    const chunkSize = isCloudEnv ? 2 : 4;
    const exportedClips: Array<{ title: string; filename: string; url: string; duration: number }> = [];

    const videoTitle = (job.videoInfo?.title || '')
      .replace(/[\\/:*?"<>|#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    for (let i = 0; i < clips.length; i += chunkSize) {
      const chunk = clips.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (clip, idx) => {
          const clipIndex = i + idx;
          const trim = params.clipTrims?.[clip.id];
          const startTime = trim?.start ?? clip.startTime;
          const endTime = trim?.end ?? clip.endTime;
          const headlineText = params.customHeadlines?.[clip.id] ?? clip.suggestedHeadline ?? '';

          let clipSource = job.videoPath && fs.existsSync(job.videoPath) ? job.videoPath : null;
          let renderStart = startTime;
          let renderEnd = endTime;

          // If full video is still buffering in background, download only this 15-30s section in ~1-2s!
          if (!clipSource) {
            console.log(`⚡ [Shorts Folder] Fast on-demand section download for clip ${clipIndex + 1} (${startTime}s -> ${endTime}s)...`);
            clipSource = await this.downloadClipSection({
              url: targetUrl!,
              startTime,
              endTime,
            });
            renderStart = 0;
            renderEnd = Math.max(1, endTime - startTime);
          }

          const res = await this.renderShortClip({
            sourceVideoPath: clipSource,
            startTime: renderStart,
            endTime: renderEnd,
            aspectRatio,
            headlineText,
            targetResolution: params.targetResolution,
            captionStyle: params.captionStyle,
            transcriptSegments: clip.transcriptSegments || job.transcript || [],
            bgMusicTrack: params.bgMusicTrack,
            bgMusicVolume: params.bgMusicVolume,
            autoDucking: params.autoDucking,
          });

          let cleanName = cleanClipTitle(clip.title, 'Highlight')
            .replace(/[\\/:*?"<>|#]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (cleanName.length > 100) cleanName = cleanName.substring(0, 100).trim();
          const cleanFilename = `${cleanName}.mp4`;
          const destinationPath = path.join(folderPath, cleanFilename);

          // Copy rendered short into dedicated folder
          fs.copyFileSync(res.filePath, destinationPath);

          return {
            title: cleanName,
            filename: cleanFilename,
            url: `/uploads/shorts/${folderName}/${encodeURIComponent(cleanFilename)}`,
            duration: res.duration,
          };
        })
      );
      exportedClips.push(...results);
    }

    // Write viral hashtags to hashtags.txt and upload tags to tags.txt
    const hashtagsList = job.hashtags || (job.videoInfo ? this.generateHashtags(job.videoInfo) : ['#shorts', '#viral', '#trending']);
    const hashtagsFileContent = [
      '========================================================================',
      'VIRAL SOCIAL MEDIA HASHTAGS (YouTube Shorts, Instagram Reels, TikTok)',
      '========================================================================',
      hashtagsList.join(' '),
      '',
      'YOUTUBE STUDIO TAGS (Copy & paste directly into YouTube video tags field):',
      hashtagsList.map((h) => h.replace(/^#/, '')).join(', '),
      '',
    ].join('\n');
    fs.writeFileSync(path.join(folderPath, 'hashtags.txt'), hashtagsFileContent, 'utf-8');

    // Write a clean summary.txt metadata file inside the folder
    const summaryLines = [
      `CINEMIQ SHORTS EXPORT - ${job.videoInfo?.title || 'YouTube Video'}`,
      `Total Clips: ${exportedClips.length}`,
      `Aspect Ratio: ${aspectRatio}`,
      `Exported At: ${new Date().toLocaleString()}`,
      '',
      'VIRAL HASHTAGS FOR UPLOAD:',
      hashtagsList.join(' '),
      '',
      'CLIPS SUMMARY & TIMINGS:',
      '------------------------------------------------',
      ...clips.map((c, idx) => {
        const exported = exportedClips[idx];
        return [
          `#${idx + 1}: ${exported?.filename || c.title}`,
          `Virality Score: ${c.viralityScore}% | Pacing: ${c.pacing || 'Fast & Dynamic'} | Trigger: ${c.engagementType || 'High Retention'}`,
          `Speech Metrics: ${c.speechTempo || '140 WPM'} (${c.wordCount || 60} words) | Hook: ${c.hook}`,
          `Duration: ${Math.round(c.duration)}s (${c.startTime}s - ${c.endTime}s)`,
          `Headline Overlay: ${params.customHeadlines?.[c.id] || c.suggestedHeadline}`,
          `Key Topics: ${(c.keyTopics || []).join(', ')}`,
          `Ready-to-Post Description:\n${c.recommendedDescription || ''}`,
          `Title Variants:\n${(c.titleVariants || []).map((t, tIdx) => `  ${tIdx + 1}. ${t}`).join('\n')}`,
          `Tags: ${(c.tags || []).join(' ')}`,
          '------------------------------------------------',
        ].join('\n');
      }),
    ];
    fs.writeFileSync(path.join(folderPath, 'summary.txt'), summaryLines.join('\n'), 'utf-8');

    // Also package a ready-to-download ZIP archive so cloud/live environments have instant bundle access
    const zipFilename = `cinemiq-shorts-${folderName}.zip`;
    const zipPath = path.join(uploadsDir, zipFilename);
    try {
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        let archive: any;
        if (typeof (archiverModule as any).ZipArchive === 'function') {
          archive = new (archiverModule as any).ZipArchive({ zlib: { level: 4 } });
        } else if (typeof (archiverModule as any).default === 'function') {
          archive = (archiverModule as any).default('zip', { zlib: { level: 4 } });
        } else if (typeof (archiverModule as any) === 'function') {
          archive = (archiverModule as any)('zip', { zlib: { level: 4 } });
        } else {
          return resolve();
        }

        output.on('close', () => resolve());
        archive.on('error', (err: any) => reject(err));
        archive.pipe(output);

        for (const item of exportedClips) {
          const itemPath = path.join(folderPath, item.filename);
          if (fs.existsSync(itemPath)) {
            archive.file(itemPath, { name: item.filename });
          }
        }
        if (fs.existsSync(path.join(folderPath, 'summary.txt'))) {
          archive.file(path.join(folderPath, 'summary.txt'), { name: 'summary.txt' });
        }
        if (fs.existsSync(path.join(folderPath, 'hashtags.txt'))) {
          archive.file(path.join(folderPath, 'hashtags.txt'), { name: 'hashtags.txt' });
        }
        archive.finalize();
      });
    } catch (zipErr) {
      console.warn('Folder companion zip creation note:', zipErr);
    }

    return {
      folderName,
      folderPath,
      totalClips: exportedClips.length,
      clips: exportedClips,
      zipUrl: fs.existsSync(zipPath) ? `/uploads/shorts/${zipFilename}` : undefined,
      zipFilename: fs.existsSync(zipPath) ? zipFilename : undefined,
    };
  },

  /**
   * Open directory directly in OS File Explorer (Windows Explorer, macOS Finder, Linux)
   */
  openSystemFolder(targetPath: string): void {
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Directory not found: ${targetPath}`);
    }
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    if (isWindows) {
      spawn('explorer.exe', [targetPath], { detached: true, stdio: 'ignore' });
    } else if (isMac) {
      spawn('open', [targetPath], { detached: true, stdio: 'ignore' });
    } else {
      spawn('xdg-open', [targetPath], { detached: true, stdio: 'ignore' });
    }
  },
};
