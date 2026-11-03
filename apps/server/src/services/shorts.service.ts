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

  // Filter segments falling inside the clip range
  const clipSegs = segments.filter((s) => s.end > clipStartTime && s.start < clipEndTime);
  if (clipSegs.length === 0) return null;

  const events: string[] = [];

  for (const seg of clipSegs) {
    const segStartRel = Math.max(0, seg.start - clipStartTime);
    const segEndRel = Math.max(segStartRel + 0.3, seg.end - clipStartTime);
    const words = seg.words || [];

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
        const clusterStart = Math.max(0, cluster[0].start - clipStartTime);
        const clusterEnd = Math.max(clusterStart + 0.4, cluster[cluster.length - 1].end - clipStartTime);

        for (let activeIdx = 0; activeIdx < cluster.length; activeIdx++) {
          const activeWord = cluster[activeIdx];
          const wordStartRel = Math.max(clusterStart, activeWord.start - clipStartTime);
          const wordEndRel = Math.min(clusterEnd, Math.max(wordStartRel + 0.15, activeWord.end - clipStartTime));

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

    // 3. Download subtitles using yt-dlp with strict 5s timeout
    try {
      const vttTemplate = path.join(uploadsDir, `yt-${sanitizedId}.%(ext)s`);
      const args = [
        '--js-runtimes',
        'node',
        '--skip-download',
        '--write-auto-subs',
        '--write-subs',
        '--sub-langs',
        'en.*,en,hi.*',
        '--sub-format',
        'vtt',
        '--no-playlist',
        '--no-warnings',
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
        }, 5000);

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

    // 3. Fast progressive stream download with parallel connections & direct write
    job.status = 'downloading';
    job.stage = 'Clips ready! Caching high-speed stream for preview & export...';
    job.progress = 50;
    job.downloadStartTime = Date.now();

    await new Promise<void>((resolve, reject) => {
      const outputTemplate = path.join(uploadsDir, `yt-${sanitizedId}.%(ext)s`);
      const dlArgs = [
        '--js-runtimes',
        'node',
        '--newline',
        '-N',
        '8',
        '--no-part',
        '--buffer-size',
        '2M',
        '--concurrent-fragments',
        '8',
        '-f',
        'best[ext=mp4][height<=720]/best[height<=720]/18/bestvideo[height<=720]+bestaudio/best',
        '--merge-output-format',
        'mp4',
        '--no-playlist',
        '--no-abort-on-error',
        '--extractor-args',
        'youtube:player_client=android,web',
        '--retry-sleep',
        'exp=1:10',
        '--retries',
        '3',
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
          if (stderr.includes('429') || stderr.includes('Too Many Requests')) {
            reject(new Error('YouTube rate-limited this request (HTTP 429). Please try again in a few moments, or use the "Upload Video" tab to process your file directly.'));
          } else {
            reject(new Error(`Video download failed: ${stderr.substring(0, 250) || 'Unknown error'}`));
          }
        }
      });

      dlProc.on('error', (err) => reject(err));
    });

    job.downloadEndTime = Date.now();
    job.downloadTimeMs = job.downloadEndTime - (job.downloadStartTime || jobStartTime);
    job.isCachedSource = false;

    // Locate downloaded video
    const updatedFiles = fs.readdirSync(uploadsDir);
    const videoFile = updatedFiles.find(
      (f) => (f.startsWith(`yt-${sanitizedId}`) || f.startsWith(jobId)) && (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv'))
    );
    if (!videoFile) {
      throw new Error('Downloaded video file could not be found.');
    }

    const finalVideoPath = path.join(uploadsDir, videoFile);
    job.videoPath = finalVideoPath;
    job.videoUrl = `/uploads/shorts/${videoFile}`;
    job.progress = 100;
    job.stage = `Analysis complete! All ${earlyClips.length} clips ready to preview and export.`;
    job.status = 'done';
  },

  /**
   * AI Analysis using OpenAI GPT or intelligent algorithmic sentence-snapped fallback
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

    // Try OpenAI if configured and we have transcript text
    if (openai && transcript.length > 5) {
      try {
        console.log(`🤖 [Shorts AI] Querying OpenAI for ${clipCount} viral clips across duration ${duration}s...`);
        let sampledTranscript = transcript;
        if (transcript.length > 300) {
          const step = Math.ceil(transcript.length / 300);
          sampledTranscript = transcript.filter((_, idx) => idx % step === 0);
        }

        const transcriptText = sampledTranscript
          .map((s) => `[${Math.round(s.start)}s - ${Math.round(s.end)}s] ${s.text}`)
          .join('\n');

        const prompt = `You are an elite YouTube Shorts, TikTok, and Instagram Reels editor.
Your mission is to find the top ${clipCount} most viral, addictive, high-retention moments from this video transcript.
Ensure the clips are well distributed throughout the video (early hooks, middle peaks, climax moments, takeaways).

Video Title: "${info.title}"
Total Duration: ${Math.round(duration)} seconds
Desired Clip Length: Between ${minLen} and ${maxLen} seconds.

Rules:
1. Every clip must start with a powerful HOOK (curiosity, controversial claim, shocking fact, or emotion).
2. Look for complete thoughts, jokes, revelations, or punchy stories that work independently as a 9:16 vertical short.
3. Keep startTime and endTime strictly within 0 and ${Math.round(duration)}.
4. Clip duration must be between ${minLen} and ${maxLen} seconds.
5. Provide a virality score between 80 and 99.
6. Provide a punchy "suggestedHeadline" for the video overlay (e.g. "WAIT TILL THE END 😱" or "HOW HE ACTUALLY DID IT 🔥").

Respond strictly with valid JSON conforming to this schema:
{
  "clips": [
    {
      "title": "Catchy title with emoji",
      "startTime": 12.5,
      "endTime": 42.0,
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
            const aiClips = parsed.clips.map((c: any, index: number) => {
              const start = Math.max(0, parseFloat(c.startTime) || 0);
              const end = Math.min(duration, parseFloat(c.endTime) || minLen);
              const clipSegs = transcript.filter((s) => s.end > start && s.start < end);
              const clipDur = Math.max(10, end - start);

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
              const engagementType = engagementArchetypes[index % engagementArchetypes.length];

              const hookQuote = c.hook || (clipSegs[0]?.text ? `"${clipSegs[0].text}..."` : 'Opening hook from speech');
              const headline = c.suggestedHeadline || c.title?.toUpperCase() || "DON'T MISS THIS ⚡";

              const rawKeywords = words
                .map((w) => w.replace(/[^a-zA-Z]/g, ''))
                .filter((w) => w.length >= 4 && !['this', 'that', 'with', 'from', 'have', 'were', 'what', 'then'].includes(w.toLowerCase()));
              const keyTopics = Array.from(new Set(rawKeywords)).slice(0, 5);

              const titleVariants = [
                c.title || `Viral Highlight #${index + 1}`,
                headline,
                `Wait till you hear this part... 😱`,
              ];

              const channelTag = (info.channel || 'creator').replace(/[^a-zA-Z0-9]/g, '');
              const recommendedDescription = `🚨 Watch till the end: ${c.reason || 'This moment had everyone talking.'}\n\n"${hookQuote}"\n\n👇 What do you think about this? Let us know in the comments!\n\n#shorts #${channelTag} #viral #trending #reels #fyp`;

              return {
                id: `clip-${index + 1}-${Math.random().toString(36).substring(2, 6)}`,
                title: c.title || `Viral Highlight #${index + 1}`,
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
              };
            });

            if (aiClips.length >= clipCount) {
              return aiClips.slice(0, clipCount);
            }

            const algorithmicFill = this.generateAlgorithmicClips(info, transcript, clipCount, minLen, maxLen);
            const combined = [...aiClips, ...algorithmicFill.slice(aiClips.length)];
            return combined.slice(0, clipCount);
          }
        }
      } catch (err: any) {
        console.warn('⚠️ OpenAI analysis failed or skipped, falling back to smart heuristic:', err.message);
      }
    }

    // Meaningful sentence-snapped algorithmic highlight partitioner
    console.log(`⚡ [Shorts AI] Generating ${clipCount} viral clips across ${duration}s using sentence-snapped partitioner...`);
    return this.generateAlgorithmicClips(info, transcript, clipCount, minLen, maxLen);
  },

  /**
   * Algorithmic highlight detector: extracts meaningful, complete thought segments
   * Snaps startTime to sentence openings and endTime to terminal punctuation (.?!)
   * Attaches word-level timestamp cues for kinetic lyric motion graphics
   */
  generateAlgorithmicClips(
    info: VideoInfo,
    transcript: TranscriptSegment[],
    count: number,
    minLen: number,
    maxLen: number
  ): ViralClip[] {
    const totalDuration = info.duration > 0 ? info.duration : 120;
    const clips: ViralClip[] = [];

    const archetypes = [
      {
        titleSuffix: 'The Cold Opening Hook 💥',
        headline: 'THEY NEVER SAW THIS COMING 😱',
        reason: 'Immediate curiosity gap in the first minutes.',
        score: 98,
      },
      {
        titleSuffix: 'First Guest Intro & Energy 🔥',
        headline: 'HE CAME READY WITH SMOKE 🔥',
        reason: 'High energy persona dynamic and sharp introduction.',
        score: 96,
      },
      {
        titleSuffix: 'The Core Truth Revelation 💡',
        headline: 'WHAT NOBODY WANTS TO ADMIT 🤫',
        reason: 'Psychological intrigue and surprising viewpoint.',
        score: 97,
      },
      {
        titleSuffix: 'Unfiltered Banter & Roast 😂',
        headline: 'EVERYONE LOST THEIR MINDS HERE 💀',
        reason: 'Peak comedic timing and viral shareability.',
        score: 95,
      },
      {
        titleSuffix: 'The Heated Debate ⚡',
        headline: 'THINGS JUST GOT INTENSE 🥊',
        reason: 'High-stakes conflict that triggers debate in comments.',
        score: 94,
      },
      {
        titleSuffix: 'Controversial Statement 🚨',
        headline: 'DID HE ACTUALLY JUST SAY THAT? 🤯',
        reason: 'Jaw-dropping remark with maximum replay value.',
        score: 96,
      },
      {
        titleSuffix: 'Unexpected Plot Twist 🔄',
        headline: 'WAIT FOR THE SUDDEN TWIST 👀',
        reason: 'Complete narrative subversion that boosts watch time.',
        score: 93,
      },
      {
        titleSuffix: 'Mid-Episode Showstopper 🌟',
        headline: 'THE BEST MOMENT OF THE WHOLE SHOW 🔥',
        reason: 'Highest energy moment of the entire discussion.',
        score: 95,
      },
      {
        titleSuffix: 'The Wild Room Reaction 🤯',
        headline: 'THE ENTIRE ROOM COLLAPSED 🤣',
        reason: 'Viral crowd reaction and explosive laughter.',
        score: 92,
      },
      {
        titleSuffix: 'Hidden Secret Exposed 🗝️',
        headline: 'THE SECRET THEY TRIED TO HIDE 🤐',
        reason: 'Exclusive behind-the-scenes insider knowledge.',
        score: 94,
      },
      {
        titleSuffix: 'Savage Comeback / Mic Drop 🎯',
        headline: 'THE COLDEST COMEBACK EVER 💀',
        reason: 'Instant punchline payoff with replay momentum.',
        score: 93,
      },
      {
        titleSuffix: 'High Tension Silence ⏱️',
        headline: 'YOU COULD HEAR A PIN DROP 🥶',
        reason: 'Dramatic suspension and suspenseful pacing.',
        score: 91,
      },
      {
        titleSuffix: 'Unbelievable Story Time 📖',
        headline: 'THE CRAZIEST STORY YOU WILL HEAR 📖',
        reason: 'Addictive narrative flow with strong cliffhanger.',
        score: 94,
      },
      {
        titleSuffix: 'Emotional Raw Moment ❤️',
        headline: 'THIS HIT DIFFERENT TO EVERYONE 🥺',
        reason: 'Authentic vulnerability that connects deeply with viewers.',
        score: 90,
      },
      {
        titleSuffix: 'Million Dollar Advice 🧠',
        headline: 'REMEMBER THIS PIECE OF ADVICE 💰',
        reason: 'High utility value that viewers save and bookmark.',
        score: 95,
      },
      {
        titleSuffix: 'Pure Chaos Unleashed 🌪️',
        headline: 'WHEN EVERYTHING WENT COMPLETELY OFF THE RAILS 🚨',
        reason: 'Unpredictable spontaneous chaos.',
        score: 92,
      },
      {
        titleSuffix: 'The Ultimate Rebuttal ⚔️',
        headline: 'HOW TO END AN ENTIRE ARGUMENT 💥',
        reason: 'Decisive rhetoric and sharp logical checkmate.',
        score: 91,
      },
      {
        titleSuffix: 'Peak Conversational Chemistry 🤝',
        headline: 'THE CHEMISTRY WAS OUT OF CONTROL ✨',
        reason: 'Magnetic back-and-forth rhythm and banter.',
        score: 89,
      },
      {
        titleSuffix: 'The Climax & Turning Point 🚀',
        headline: 'THIS IS WHERE EVERYTHING CHANGED 🚨',
        reason: 'Climactic peak that resolves preceding buildup.',
        score: 96,
      },
      {
        titleSuffix: 'The Shocking Verdict ⚖️',
        headline: 'THE DECISION NOBODY EXPECTED 😱',
        reason: 'Suspenseful judgment and ultimate reaction.',
        score: 93,
      },
      {
        titleSuffix: 'Final Golden Nugget 🎯',
        headline: 'PAY CLOSE ATTENTION TO THIS TAKEAWAY 🎯',
        reason: 'Actionable conclusion that drives comment engagement.',
        score: 88,
      },
      {
        titleSuffix: 'The Masterclass Outro 🎩',
        headline: 'ENDING ON THE PERFECT NOTE 🎤',
        reason: 'Memorable sign-off quote that stays with the viewer.',
        score: 87,
      },
      {
        titleSuffix: 'Audience Favorite Highlight 💎',
        headline: 'EVERYONE IS TALKING ABOUT THIS PART 🔥',
        reason: 'Identified as a high-density keyword moment.',
        score: 91,
      },
      {
        titleSuffix: 'Unfiltered Reality ⚡',
        headline: 'THE HARSH REALITY WE MUST FACE ⚡',
        reason: 'No-nonsense direct breakdown of the situation.',
        score: 89,
      },
      {
        titleSuffix: 'Bonus Viral Blooper 🎬',
        headline: 'THE PART THEY ALMOST CUT OUT 💀',
        reason: 'Exclusive candid humor and behind-the-scenes charm.',
        score: 90,
      },
    ];

    const safeCount = Math.max(1, Math.min(count, 150));
    const startMargin = Math.min(15, totalDuration * 0.02);
    const usableDuration = Math.max(10, totalDuration - startMargin - minLen);
    const intervalStep = safeCount > 1 ? usableDuration / (safeCount - 1) : 0;

    for (let i = 0; i < safeCount; i++) {
      const template = archetypes[i % archetypes.length];
      const cycle = Math.floor(i / archetypes.length);
      const partSuffix = cycle > 0 ? ` (Part ${cycle + 1})` : '';

      const targetLength = Math.min(maxLen, Math.max(minLen, 24 + ((i * 5) % 25)));

      let rawStart = Math.round(startMargin + i * intervalStep);
      if (rawStart + targetLength > totalDuration) {
        rawStart = Math.max(0, totalDuration - targetLength);
      }
      let rawEnd = Math.min(totalDuration, rawStart + targetLength);

      let snappedStart = rawStart;
      let snappedEnd = rawEnd;
      let clipSegments: TranscriptSegment[] = [];

      // Meaningful Slicing: Snap to natural sentence beginnings and ends
      if (transcript && transcript.length > 0) {
        // Find segment starting closest to rawStart with sentence start preference
        const nearbyStarts = transcript.filter((t) => Math.abs(t.start - rawStart) <= 8);
        if (nearbyStarts.length > 0) {
          // Prefer capitalized segment or one preceded by a sentence terminal (.?!) or pause
          const bestStart =
            nearbyStarts.find((s, idx) => {
              if (idx > 0) {
                const prev = nearbyStarts[idx - 1];
                if (/[.?!]$/.test(prev.text.trim()) || s.start - prev.end > 1.0) return true;
              }
              return /^[A-Z]/.test(s.text.trim());
            }) || nearbyStarts[0];
          snappedStart = Math.max(0, bestStart.start);
        }

        // Find segment ending closest to rawEnd with sentence end preference (.?!)
        const minTargetEnd = snappedStart + minLen;
        const maxTargetEnd = Math.min(totalDuration, snappedStart + maxLen);
        const nearbyEnds = transcript.filter((t) => t.end >= minTargetEnd && t.end <= maxTargetEnd + 5);

        if (nearbyEnds.length > 0) {
          const bestEnd =
            nearbyEnds.find((s) => /[.?!]$/.test(s.text.trim())) ||
            nearbyEnds[nearbyEnds.length - 1];
          snappedEnd = Math.min(totalDuration, bestEnd.end);
        } else {
          snappedEnd = Math.min(totalDuration, snappedStart + targetLength);
        }

        clipSegments = transcript.filter((t) => t.start >= snappedStart && t.end <= snappedEnd);
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

      const baseTitle = info.title && info.title !== 'YouTube Video' ? info.title.substring(0, 32) : 'Highlight';
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
      const engagementType = engagementTypes[i % engagementTypes.length];

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

      // 3 Title Variants for A/B testing
      const titleVariants = [
        `${baseTitle} - ${template.titleSuffix}${partSuffix}`,
        `${template.headline}${cycle > 0 ? ` #${i + 1}` : ''}`,
        `Did they actually say this?! 😱 ${partSuffix}`.trim(),
      ];

      // Platform ready description
      const channelTag = (info.channel || 'creator').replace(/[^a-zA-Z0-9]/g, '');
      const recommendedDescription = `🚨 ${template.headline}\n\n"${hook}"\n\n📌 Breakdown: ${template.reason}\n\n👇 Drop your thoughts below!\n\n#shorts #${channelTag} #viral #trending #reels #fyp #mindblown #podcast`;

      // 12-16 tailored tags per clip
      const clipTags = [
        '#shorts',
        '#viral',
        '#trending',
        '#reels',
        '#fyp',
        '#foryou',
        `#${template.titleSuffix.replace(/[^a-zA-Z0-9]/g, '')}`,
        ...(channelTag ? [`#${channelTag}`] : []),
        ...keyTopics.map((k) => `#${k}`),
        '#cinemiq',
        '#explorepage',
        '#mustwatch',
      ].filter((t, idx, arr) => t.length > 2 && arr.indexOf(t) === idx);

      clips.push({
        id: `clip-${i + 1}-${Math.random().toString(36).substring(2, 6)}`,
        title: `${baseTitle} - ${template.titleSuffix}${partSuffix}`,
        startTime: Math.round(snappedStart * 10) / 10,
        endTime: Math.round(snappedEnd * 10) / 10,
        duration: Math.round(clipDur * 10) / 10,
        viralityScore: Math.max(78, template.score - Math.floor((i % archetypes.length) * 0.3) - (cycle * 2)),
        reason: template.reason,
        hook,
        suggestedHeadline: `${template.headline}${cycle > 0 ? ` #${i + 1}` : ''}`,
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

    const args = [
      '--js-runtimes',
      'node',
      '--newline',
      '--download-sections',
      `*${startStr}-${endStr}`,
      '-f',
      'best[ext=mp4][height<=720]/best[height<=720]/18/best',
      '--no-playlist',
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
    if (!job || !job.videoPath || !fs.existsSync(job.videoPath)) {
      throw new Error(`Job or source video not found for ID: ${params.jobId}`);
    }

    const clips = job.clips || [];
    if (clips.length === 0) {
      throw new Error('No clips available in this job to export');
    }

    const aspectRatio = params.aspectRatio || '9:16-blur';
    const uploadsDir = getUploadsDir();
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

    // Render clips in chunks of 4 for ultra-fast throughput
    const renderedFiles: Array<{ title: string; filePath: string }> = [];
    const chunkSize = 4;

    for (let i = 0; i < clips.length; i += chunkSize) {
      const chunk = clips.slice(i, i + chunkSize);
      const results = await Promise.all(
        chunk.map(async (clip, idx) => {
          const clipIndex = i + idx;
          const trim = params.clipTrims?.[clip.id];
          const startTime = trim?.start ?? clip.startTime;
          const endTime = trim?.end ?? clip.endTime;
          const headlineText = params.customHeadlines?.[clip.id] ?? clip.suggestedHeadline ?? '';

          const res = await this.renderShortClip({
            sourceVideoPath: job.videoPath!,
            startTime,
            endTime,
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
            title: clip.title || `Short-${clipIndex + 1}`,
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

      const videoTitle = (job.videoInfo?.title || '')
        .replace(/[\\/:*?"<>|#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      for (let idx = 0; idx < renderedFiles.length; idx++) {
        const item = renderedFiles[idx];
        const cleanClip = (item.title || `Clip ${idx + 1}`)
          .replace(/[\\/:*?"<>|#]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        let fullTitle = '';
        if (videoTitle && cleanClip) {
          if (cleanClip.toLowerCase().includes(videoTitle.toLowerCase())) {
            fullTitle = cleanClip;
          } else {
            fullTitle = `${videoTitle} - ${cleanClip}`;
          }
        } else {
          fullTitle = cleanClip || videoTitle || `Clip ${idx + 1}`;
        }

        if (fullTitle.length > 120) fullTitle = fullTitle.substring(0, 120).trim();
        const entryName = `${String(idx + 1).padStart(2, '0')} - ${fullTitle}.mp4`;
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
  }> {
    const job = activeJobs.get(params.jobId);
    if (!job || !job.videoPath || !fs.existsSync(job.videoPath)) {
      throw new Error(`Job or source video not found for ID: ${params.jobId}`);
    }

    const clips = job.clips || [];
    if (clips.length === 0) {
      throw new Error('No clips available in this job to export');
    }

    const aspectRatio = params.aspectRatio || '9:16-blur';
    const uploadsDir = getUploadsDir();
    const folderName = `${params.jobId}-shorts`;
    const folderPath = path.join(uploadsDir, folderName);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Render clips in parallel chunks
    const exportedClips: Array<{ title: string; filename: string; url: string; duration: number }> = [];
    const chunkSize = 4;

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

          const res = await this.renderShortClip({
            sourceVideoPath: job.videoPath!,
            startTime,
            endTime,
            aspectRatio,
            headlineText,
            targetResolution: params.targetResolution,
            captionStyle: params.captionStyle,
            transcriptSegments: clip.transcriptSegments || job.transcript || [],
            bgMusicTrack: params.bgMusicTrack,
            bgMusicVolume: params.bgMusicVolume,
            autoDucking: params.autoDucking,
          });

          const cleanClip = (clip.title || `Clip ${clipIndex + 1}`)
            .replace(/[\\/:*?"<>|#]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

          let fullTitle = '';
          if (videoTitle && cleanClip) {
            if (cleanClip.toLowerCase().includes(videoTitle.toLowerCase())) {
              fullTitle = cleanClip;
            } else {
              fullTitle = `${videoTitle} - ${cleanClip}`;
            }
          } else {
            fullTitle = cleanClip || videoTitle || `Clip ${clipIndex + 1}`;
          }

          if (fullTitle.length > 120) fullTitle = fullTitle.substring(0, 120).trim();
          const cleanFilename = `${String(clipIndex + 1).padStart(2, '0')} - ${fullTitle}.mp4`;
          const destinationPath = path.join(folderPath, cleanFilename);

          // Copy rendered short into dedicated folder
          fs.copyFileSync(res.filePath, destinationPath);

          return {
            title: fullTitle,
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

    return {
      folderName,
      folderPath,
      totalClips: exportedClips.length,
      clips: exportedClips,
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
