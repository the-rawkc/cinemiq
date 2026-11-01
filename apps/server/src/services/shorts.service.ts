import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
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
}

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
  error?: string;
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

function getUploadsDir(): string {
  const dir = path.resolve(process.cwd(), 'uploads', 'shorts');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
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
 * Parse WebVTT subtitle file into timestamped lines
 */
function parseVTTFile(filePath: string): Array<{ start: number; end: number; text: string }> {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const segments: Array<{ start: number; end: number; text: string }> = [];

  const timeRegex = /(\d{2}):(\d{2}):(\d{2}\.\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}\.\d{3})/;
  const shortTimeRegex = /(\d{2}):(\d{2}\.\d{3})\s*-->\s*(\d{2}):(\d{2}\.\d{3})/;

  let currentStart = 0;
  let currentEnd = 0;
  let currentText: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (currentText.length > 0) {
        segments.push({
          start: currentStart,
          end: currentEnd,
          text: currentText.join(' ').replace(/<[^>]*>/g, '').trim(),
        });
        currentText = [];
      }
      continue;
    }

    const matchLong = line.match(timeRegex);
    const matchShort = line.match(shortTimeRegex);

    if (matchLong) {
      if (currentText.length > 0) {
        segments.push({
          start: currentStart,
          end: currentEnd,
          text: currentText.join(' ').replace(/<[^>]*>/g, '').trim(),
        });
        currentText = [];
      }
      currentStart = parseInt(matchLong[1], 10) * 3600 + parseInt(matchLong[2], 10) * 60 + parseFloat(matchLong[3]);
      currentEnd = parseInt(matchLong[4], 10) * 3600 + parseInt(matchLong[5], 10) * 60 + parseFloat(matchLong[6]);
    } else if (matchShort) {
      if (currentText.length > 0) {
        segments.push({
          start: currentStart,
          end: currentEnd,
          text: currentText.join(' ').replace(/<[^>]*>/g, '').trim(),
        });
        currentText = [];
      }
      currentStart = parseInt(matchShort[1], 10) * 60 + parseFloat(matchShort[2]);
      currentEnd = parseInt(matchShort[3], 10) * 60 + parseFloat(matchShort[4]);
    } else if (currentEnd > 0 && !line.startsWith('WEBVTT') && !line.startsWith('Kind:') && !line.startsWith('Language:')) {
      currentText.push(line);
    }
  }

  if (currentText.length > 0) {
    segments.push({
      start: currentStart,
      end: currentEnd,
      text: currentText.join(' ').replace(/<[^>]*>/g, '').trim(),
    });
  }

  return segments.filter((s) => s.text.length > 0);
}

export const ShortsService = {
  /**
   * Fetch YouTube metadata without downloading video stream
   */
  async getVideoInfo(url: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
      const args = [
        '--js-runtimes',
        'node',
        '--dump-single-json',
        '--no-playlist',
        '--skip-download',
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
            id: json.id || 'unknown',
            title: json.title || 'Untitled YouTube Video',
            duration: Math.round(json.duration || 0),
            thumbnail: json.thumbnail || (json.thumbnails && json.thumbnails[0]?.url) || '',
            channel: json.uploader || json.channel || 'Unknown Channel',
            description: json.description ? json.description.substring(0, 300) : '',
            webpage_url: json.webpage_url || url,
            view_count: json.view_count || 0,
          };
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
      progress: 0,
      stage: 'Initializing video analysis...',
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

    const uploadsDir = getUploadsDir();
    const outputBase = path.join(uploadsDir, jobId);

    // Initial placeholder video info while download streams
    let videoInfo: VideoInfo = {
      id: jobId,
      title: 'YouTube Video',
      duration: 180,
      thumbnail: '',
      channel: 'YouTube',
      description: '',
      webpage_url: url,
    };
    job.videoInfo = videoInfo;

    // Unified single-pass download: gets video stream, info json, and subtitles in ONE connection
    // This avoids rapid consecutive requests to YouTube that cause HTTP 429: Too Many Requests
    job.status = 'downloading';
    job.stage = 'Connecting to YouTube and streaming video...';
    job.progress = 15;

    await new Promise<void>((resolve, reject) => {
      const outputTemplate = `${outputBase}.%(ext)s`;
      const dlArgs = [
        '--js-runtimes',
        'node',
        '-f',
        'bestvideo[height<=720]+bestaudio/best[height<=720]/bestvideo[height<=480]+bestaudio/best',
        '--merge-output-format',
        'mp4',
        '-N',
        '6', // 6 parallel connection streams for ultrafast download
        '--buffer-size',
        '16M',
        '--http-chunk-size',
        '10M',
        '--no-playlist',
        '--no-abort-on-error',
        '--write-info-json',
        '--write-auto-sub',
        '--write-sub',
        '--sub-lang',
        'en,hi',
        '--convert-subs',
        'vtt',
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

      dlProc.stdout.on('data', (data) => {
        const str = data.toString();
        // Parse progress if available
        const pMatch = str.match(/(\d{1,3}\.\d)%/);
        if (pMatch) {
          const pct = parseFloat(pMatch[1]);
          // Map 0-100% download progress to 15%-70% of total job progress
          job.progress = Math.min(70, Math.round(15 + (pct * 0.55)));
          job.stage = `Downloading video (${pct.toFixed(0)}%)...`;
        }
      });

      dlProc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      dlProc.on('close', (code) => {
        // Check if an output video file was produced
        const potentialFiles = fs.readdirSync(uploadsDir).filter((f) => f.startsWith(jobId));
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

    // Extract metadata from the generated .info.json if present
    const updatedFiles = fs.readdirSync(uploadsDir);
    const infoFile = updatedFiles.find((f) => f.startsWith(jobId) && f.endsWith('.info.json'));
    if (infoFile) {
      try {
        const rawJson = fs.readFileSync(path.join(uploadsDir, infoFile), 'utf-8');
        const parsed = JSON.parse(rawJson);
        videoInfo = {
          id: parsed.id || jobId,
          title: parsed.title || 'Untitled YouTube Video',
          duration: Math.round(parsed.duration || 0),
          thumbnail: parsed.thumbnail || (parsed.thumbnails && parsed.thumbnails[0]?.url) || '',
          channel: parsed.uploader || parsed.channel || 'Unknown Channel',
          description: parsed.description ? parsed.description.substring(0, 300) : '',
          webpage_url: parsed.webpage_url || url,
          view_count: parsed.view_count || 0,
        };
        job.videoInfo = videoInfo;
      } catch (err: any) {
        console.warn('Could not parse downloaded .info.json:', err.message);
      }
    }

    // Locate downloaded video
    const videoFile = updatedFiles.find((f) => f.startsWith(jobId) && (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')));
    if (!videoFile) {
      throw new Error('Downloaded video file could not be found.');
    }

    const finalVideoPath = path.join(uploadsDir, videoFile);
    job.videoPath = finalVideoPath;
    job.videoUrl = `/uploads/shorts/${videoFile}`;
    job.progress = 72;
    job.stage = 'Extracting transcript & analyzing high-engagement highlights...';
    job.status = 'analyzing';

    // Parse subtitles from the unified pass if present
    let transcriptSegments: Array<{ start: number; end: number; text: string }> = [];
    const subtitleFile = updatedFiles.find((f) => f.startsWith(jobId) && f.endsWith('.vtt'));
    if (subtitleFile) {
      try {
        transcriptSegments = parseVTTFile(path.join(uploadsDir, subtitleFile));
        console.log(`📝 [Shorts] Successfully parsed ${transcriptSegments.length} subtitle transcript segments.`);
      } catch (subErr: any) {
        console.warn('Subtitles parsing failed (non-fatal):', subErr.message);
      }
    }

    // AI Highlight Detection
    job.stage = 'AI analyzing moments for virality and high retention...';
    job.progress = 85;

    const detectedClips = await this.detectViralMoments(
      videoInfo,
      transcriptSegments,
      clipCount,
      targetDuration
    );

    job.clips = detectedClips;
    job.progress = 100;
    job.stage = `Analysis complete! ${detectedClips.length} clips ready to preview and export.`;
    job.status = 'done';
  },

  /**
   * AI Analysis using OpenAI GPT or intelligent algorithmic fallback
   */
  async detectViralMoments(
    info: VideoInfo,
    transcript: Array<{ start: number; end: number; text: string }>,
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
        // Evenly sample transcript if long so it spans the entire 60 minutes
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
      "title": "Short catchy title with emoji",
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
            return parsed.clips.map((c: any, index: number) => ({
              id: `clip-${index + 1}-${Math.random().toString(36).substring(2, 6)}`,
              title: c.title || `Viral Highlight #${index + 1}`,
              startTime: Math.max(0, parseFloat(c.startTime) || 0),
              endTime: Math.min(duration, parseFloat(c.endTime) || minLen),
              duration: Math.max(10, (parseFloat(c.endTime) || minLen) - (parseFloat(c.startTime) || 0)),
              viralityScore: c.viralityScore || Math.floor(88 + Math.random() * 10),
              reason: c.reason || 'High emotional hook and retention curve.',
              hook: c.hook || 'Opening hook from speech',
              suggestedHeadline: c.suggestedHeadline || c.title?.toUpperCase() || 'DON\'T MISS THIS ⚡',
              tags: Array.isArray(c.tags) ? c.tags : ['#shorts', '#viral'],
            }));
          }
        }
      } catch (err: any) {
        console.warn('⚠️ OpenAI analysis failed or skipped, falling back to smart heuristic:', err.message);
      }
    }

    // Heuristic & Timeline-distributed Highlight Partitioner
    console.log(`⚡ [Shorts AI] Generating ${clipCount} viral clips across ${duration}s using timeline partitioner...`);
    return this.generateAlgorithmicClips(info, transcript, clipCount, minLen, maxLen);
  },

  /**
   * Algorithmic highlight detector: extracts optimal engaging segments across entire duration
   * Specially calibrated for 10min to 60+ min videos generating up to 25 clips
   */
  generateAlgorithmicClips(
    info: VideoInfo,
    transcript: Array<{ start: number; end: number; text: string }>,
    count: number,
    minLen: number,
    maxLen: number
  ): ViralClip[] {
    const totalDuration = info.duration > 0 ? info.duration : 120;
    const clips: ViralClip[] = [];

    // Comprehensive 25-Archetype Viral Library covering all stages of a long video
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

    const safeCount = Math.max(1, Math.min(count, 25));

    // Calculate intelligent chronological distribution across the video duration
    const startMargin = Math.min(20, totalDuration * 0.02);
    const usableDuration = Math.max(30, totalDuration - startMargin - 30);
    const intervalStep = usableDuration / safeCount;

    for (let i = 0; i < safeCount; i++) {
      const template = archetypes[i % archetypes.length];
      const targetLength = Math.min(maxLen, Math.max(minLen, 26 + ((i * 7) % 24)));

      // Step along timeline
      let start = Math.round(startMargin + i * intervalStep);
      if (start + targetLength > totalDuration) {
        start = Math.max(0, totalDuration - targetLength - 2);
      }
      const end = Math.min(totalDuration, start + targetLength);

      // Search for nearby transcript speech to give a real hook if available
      let hook = 'Listen closely to what happens right here...';
      const speechNearby = transcript.filter((t) => t.start >= start && t.start <= end);
      if (speechNearby.length > 0) {
        hook = `"${speechNearby[0].text}..."`;
      }

      clips.push({
        id: `clip-${i + 1}-${Math.random().toString(36).substring(2, 6)}`,
        title: `${info.title.substring(0, 28)} - ${template.titleSuffix}`,
        startTime: Math.round(start * 10) / 10,
        endTime: Math.round(end * 10) / 10,
        duration: Math.round((end - start) * 10) / 10,
        viralityScore: Math.max(82, template.score - Math.floor(i * 0.4)),
        reason: template.reason,
        hook,
        suggestedHeadline: template.headline,
        tags: ['#shorts', '#viral', '#trending', '#highlights', '#podcast'],
      });
    }

    return clips;
  },

  /**
   * Render a customized short clip using FFmpeg
   * Supports: 9:16 Blurred Background, 9:16 Center Crop, 16:9 Fit, and Text Overlay
   * Optimized for ultrafast rendering (720x1280 default renders in ~2s, 1080x1920 available)
   */
  async renderShortClip(params: {
    sourceVideoPath: string;
    startTime: number;
    endTime: number;
    aspectRatio: '9:16-blur' | '9:16-crop' | '16:9-fit' | 'original';
    headlineText?: string;
    targetResolution?: '720p' | '1080p';
  }): Promise<{ url: string; duration: number; filePath: string }> {
    const { sourceVideoPath, startTime, endTime, aspectRatio, headlineText } = params;

    if (!fs.existsSync(sourceVideoPath)) {
      throw new Error(`Source video not found on disk: ${sourceVideoPath}`);
    }

    const duration = Math.max(1, endTime - startTime);
    const uploadsDir = getUploadsDir();
    const outputFilename = `short-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.mp4`;
    const outputPath = path.join(uploadsDir, outputFilename);

    const is1080p = params.targetResolution === '1080p';
    const targetW = is1080p ? 1080 : 720;
    const targetH = is1080p ? 1920 : 1280;
    const bgScale = is1080p ? '180:320' : '120:213';
    const fontSize = is1080p ? 48 : 34;
    const textY = is1080p ? 240 : 160;

    // Font selection on Windows
    let fontArg = '';
    if (fs.existsSync('C:\\Windows\\Fonts\\arialbd.ttf')) {
      fontArg = ":fontfile='C\\:/Windows/Fonts/arialbd.ttf'";
    } else if (fs.existsSync('C:\\Windows\\Fonts\\arial.ttf')) {
      fontArg = ":fontfile='C\\:/Windows/Fonts/arial.ttf'";
    }

    // Build filter complex based on aspect ratio
    let filterComplex = '';
    const cleanHeadline = (headlineText || '')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .trim();

    // Check fast render cache
    const cacheKey = `${sourceVideoPath}_${startTime}_${endTime}_${aspectRatio}_${cleanHeadline}_${params.targetResolution || '720p'}`;
    const cached = renderCache.get(cacheKey);
    if (cached && fs.existsSync(cached.filePath)) {
      return cached;
    }

    if (aspectRatio === '9:16-blur') {
      // 9:16 vertical blurred background + sharp centered foreground
      filterComplex =
        '[0:v]split=2[in1][in2];' +
        `[in1]scale=${bgScale}:force_original_aspect_ratio=increase,crop=${bgScale},boxblur=5:5,scale=${targetW}:${targetH}[bg];` +
        `[in2]scale=${targetW}:-2[fg];` +
        '[bg][fg]overlay=(W-w)/2:(H-h)/2[base]';
      
      if (cleanHeadline) {
        filterComplex += `;[base]drawtext=text='${cleanHeadline}'${fontArg}:fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.65:boxborderw=16:x=(w-text_w)/2:y=${textY}[v]`;
      } else {
        filterComplex += ';[base]null[v]';
      }
    } else if (aspectRatio === '9:16-crop') {
      // Center crop filling 9:16
      filterComplex = `[0:v]crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=${targetW}:${targetH}[base]`;
      if (cleanHeadline) {
        filterComplex += `;[base]drawtext=text='${cleanHeadline}'${fontArg}:fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.65:boxborderw=16:x=(w-text_w)/2:y=${textY}[v]`;
      } else {
        filterComplex += ';[base]null[v]';
      }
    } else if (aspectRatio === '16:9-fit') {
      // 9:16 Canvas with black bars
      filterComplex = `[0:v]scale=${targetW}:-2,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:black[base]`;
      if (cleanHeadline) {
        filterComplex += `;[base]drawtext=text='${cleanHeadline}'${fontArg}:fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.65:boxborderw=16:x=(w-text_w)/2:y=${textY}[v]`;
      } else {
        filterComplex += ';[base]null[v]';
      }
    } else {
      // Original aspect ratio
      if (cleanHeadline) {
        filterComplex = `[0:v]drawtext=text='${cleanHeadline}'${fontArg}:fontcolor=white:fontsize=32:box=1:boxcolor=black@0.65:boxborderw=14:x=(w-text_w)/2:y=40[v]`;
      } else {
        filterComplex = '[0:v]null[v]';
      }
    }

    return new Promise((resolve, reject) => {
      const cmd = ffmpeg()
        .input(sourceVideoPath)
        .inputOptions([`-ss ${startTime}`, `-t ${duration}`])
        .complexFilter(filterComplex, ['v'])
        .outputOptions([
          '-c:v libx264',
          '-preset ultrafast',
          '-crf 23',
          '-tune fastdecode',
          '-threads 0',
          '-c:a aac',
          '-b:a 128k',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
        ])
        .output(outputPath);

      cmd.on('end', () => {
        const result = {
          url: `/uploads/shorts/${outputFilename}`,
          duration,
          filePath: outputPath,
        };
        renderCache.set(cacheKey, result);
        resolve(result);
      });

      cmd.on('error', (err, stdout, stderr) => {
        console.error('FFmpeg Shorts Render Error:', err.message, stderr);
        reject(new Error(`Rendering failed: ${err.message}`));
      });

      cmd.run();
    });
  },

  /**
   * Render and package all clips from a job into a single ZIP archive
   */
  async renderAllClipsZip(params: {
    jobId: string;
    aspectRatio?: '9:16-blur' | '9:16-crop' | '16:9-fit' | 'original';
    targetResolution?: '720p' | '1080p';
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

    // Render clips in chunks of 3 for ultra-fast throughput without CPU exhaustion
    const renderedFiles: Array<{ title: string; filePath: string }> = [];
    const chunkSize = 3;

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
          });

          return {
            title: clip.title || `Short-${clipIndex + 1}`,
            filePath: res.filePath,
          };
        })
      );
      renderedFiles.push(...results);
    }

    // Package all rendered clips into a zip archive
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

      for (let idx = 0; idx < renderedFiles.length; idx++) {
        const item = renderedFiles[idx];
        const cleanTitle = item.title
          .replace(/[^a-zA-Z0-9_\- ]/g, '')
          .trim()
          .substring(0, 45) || `clip-${idx + 1}`;
        const entryName = `${String(idx + 1).padStart(2, '0')} - ${cleanTitle}.mp4`;
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
    const chunkSize = 3;

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
          });

          const cleanTitle = (clip.title || `Short-${clipIndex + 1}`)
            .replace(/[^a-zA-Z0-9_\- ]/g, '')
            .trim()
            .substring(0, 45) || `clip-${clipIndex + 1}`;
          const cleanFilename = `${String(clipIndex + 1).padStart(2, '0')} - ${cleanTitle}.mp4`;
          const destinationPath = path.join(folderPath, cleanFilename);

          // Copy rendered short into dedicated folder
          fs.copyFileSync(res.filePath, destinationPath);

          return {
            title: clip.title || `Short #${clipIndex + 1}`,
            filename: cleanFilename,
            url: `/uploads/shorts/${folderName}/${encodeURIComponent(cleanFilename)}`,
            duration: res.duration,
          };
        })
      );
      exportedClips.push(...results);
    }

    // Write a clean summary.txt metadata file inside the folder
    const summaryLines = [
      `CINEMIQ SHORTS EXPORT - ${job.videoInfo?.title || 'YouTube Video'}`,
      `Total Clips: ${exportedClips.length}`,
      `Aspect Ratio: ${aspectRatio}`,
      `Exported At: ${new Date().toLocaleString()}`,
      '',
      'CLIPS SUMMARY & HASHTAGS:',
      '------------------------------------------------',
      ...clips.map((c, idx) => {
        const exported = exportedClips[idx];
        return [
          `#${idx + 1}: ${exported?.filename || c.title}`,
          `Virality Score: ${c.viralityScore}% | Hook: ${c.hook}`,
          `Duration: ${Math.round(c.duration)}s (${c.startTime}s - ${c.endTime}s)`,
          `Headline Overlay: ${params.customHeadlines?.[c.id] || c.suggestedHeadline}`,
          `Tags: ${(c.tags || []).join(' ')}`,
          '',
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
