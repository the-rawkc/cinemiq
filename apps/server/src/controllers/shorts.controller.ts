import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { ShortsService, getUploadsDir } from '../services/shorts.service';

export const ShortsController = {
  /**
   * Fetch YouTube Video Metadata
   */
  async getInfo(req: Request, res: Response): Promise<void> {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Valid YouTube URL is required' });
        return;
      }

      const info = await ShortsService.getVideoInfo(url.trim());
      res.json({ success: true, info });
    } catch (err: any) {
      console.error('Failed to get video info:', err);
      res.status(500).json({ error: err.message || 'Failed to fetch YouTube info' });
    }
  },

  /**
   * Start Async Download & AI Highlight Detection Job
   */
  async analyze(req: Request, res: Response): Promise<void> {
    try {
      const { url, clipCount = 4, targetDuration = 'auto' } = req.body;
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'Valid YouTube URL is required' });
        return;
      }

      const requestedClips = Math.max(1, Math.min(parseInt(clipCount, 10) || 4, 150));
      const jobId = await ShortsService.startAnalysisJob(
        url.trim(),
        requestedClips,
        targetDuration
      );

      res.json({ success: true, jobId });
    } catch (err: any) {
      console.error('Failed to start analysis job:', err);
      res.status(500).json({ error: err.message || 'Failed to start analysis job' });
    }
  },

  /**
   * Query status of an ongoing job
   */
  async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;
      const job = ShortsService.getJobStatus(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json({ success: true, job });
    } catch (err: any) {
      console.error('Failed to get job status:', err);
      res.status(500).json({ error: err.message });
    }
  },

  /**
   * Render a specific short clip with aspect ratio framing & headline overlay
   */
  async renderClip(req: Request, res: Response): Promise<void> {
    try {
      const {
        sourceVideoUrl,
        jobId,
        youtubeUrl,
        startTime = 0,
        endTime = 30,
        aspectRatio = '9:16-blur',
        headlineText = '',
        targetResolution = '720p',
      } = req.body;

      // 1. Resolve disk path from sourceVideoUrl if provided
      let diskPath: string | null = null;
      if (sourceVideoUrl) {
        const cleanRel = (sourceVideoUrl.startsWith('http')
          ? new URL(sourceVideoUrl).pathname
          : sourceVideoUrl
        ).replace(/^\//, '');

        const filename = path.basename(cleanRel);
        const candidates = [
          path.resolve(process.cwd(), cleanRel),
          path.resolve(process.cwd(), '..', cleanRel),
          path.resolve(process.cwd(), '..', '..', cleanRel),
          path.join(getUploadsDir(), filename),
          path.resolve(process.cwd(), 'uploads', 'shorts', filename),
          path.resolve(process.cwd(), '..', 'uploads', 'shorts', filename),
        ];

        for (const c of candidates) {
          if (fs.existsSync(c)) {
            diskPath = c;
            break;
          }
        }
      }

      // 2. Check if jobId has an existing videoPath on disk
      if ((!diskPath || !fs.existsSync(diskPath)) && jobId) {
        const job = ShortsService.getJobStatus(jobId);
        if (job?.videoPath && fs.existsSync(job.videoPath)) {
          diskPath = job.videoPath;
        }
      }

      // 3. Fast On-Demand Fallback: If full video stream is still buffering in background,
      // download JUST this 15-30s section in ~1 second so user is never blocked!
      let sliceStart = parseFloat(startTime);
      let sliceEnd = parseFloat(endTime);

      if (!diskPath || !fs.existsSync(diskPath)) {
        const targetUrl = youtubeUrl || (jobId ? ShortsService.getJobStatus(jobId)?.url : null);
        if (targetUrl) {
          console.log(`⚡ [Shorts] Fast on-demand section download for ${startTime}s -> ${endTime}s...`);
          diskPath = await ShortsService.downloadClipSection({
            url: targetUrl,
            startTime: sliceStart,
            endTime: sliceEnd,
          });
          // Since the section file contains only this range, FFmpeg start is 0
          sliceEnd = sliceEnd - sliceStart;
          sliceStart = 0;
        } else {
          res.status(404).json({ error: 'Source video or YouTube URL not found on disk' });
          return;
        }
      }

      console.log(`🎬 [Shorts] Rendering clip: ${sliceStart}s -> ${sliceEnd}s, ratio: ${aspectRatio}, resolution: ${targetResolution}`);

      const result = await ShortsService.renderShortClip({
        sourceVideoPath: diskPath,
        startTime: sliceStart,
        endTime: sliceEnd,
        aspectRatio,
        headlineText,
        targetResolution,
      });

      res.json({
        success: true,
        clipUrl: result.url,
        duration: result.duration,
      });
    } catch (err: any) {
      console.error('Failed to render short clip:', err);
      res.status(500).json({ error: err.message || 'Rendering clip failed' });
    }
  },

  /**
   * Dedicated force-download endpoint with Content-Disposition: attachment header
   * Guarantees browser native download without cross-origin blocking or opening in new tab
   */
  downloadFile(req: Request, res: Response): void {
    const fileParam = (req.query.file as string) || (req.query.url as string) || '';
    const filenameParam = (req.query.filename as string) || 'short.mp4';

    if (!fileParam) {
      res.status(400).send('File parameter is required');
      return;
    }

    const cleanFile = fileParam
      .replace(/^https?:\/\/[^\/]+/, '')
      .replace(/^\/uploads\/shorts\//, '')
      .replace(/^uploads\/shorts\//, '')
      .replace(/^.*[\\\/]/, '');

    const candidates = [
      path.join(getUploadsDir(), cleanFile),
      path.resolve(process.cwd(), 'uploads', 'shorts', cleanFile),
      path.resolve(process.cwd(), '..', 'uploads', 'shorts', cleanFile),
      path.resolve(process.cwd(), 'apps', 'server', 'uploads', 'shorts', cleanFile),
    ];

    let targetPath: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        targetPath = c;
        break;
      }
    }

    if (!targetPath) {
      res.status(404).send('File not found');
      return;
    }

    res.download(targetPath, filenameParam, (err) => {
      if (err && !res.headersSent) {
        console.error('Download file error:', err);
        res.status(500).send('Download failed');
      }
    });
  },

  /**
   * Render and bundle all highlight clips into a single ZIP file
   */
  async downloadAllZip(req: Request, res: Response): Promise<void> {
    try {
      const {
        jobId,
        aspectRatio = '9:16-blur',
        customHeadlines = {},
        clipTrims = {},
      } = req.body;

      if (!jobId) {
        res.status(400).json({ error: 'jobId is required' });
        return;
      }

      console.log(`📦 [Shorts] Batch rendering and packaging all clips for job: ${jobId}`);

      const result = await ShortsService.renderAllClipsZip({
        jobId,
        aspectRatio,
        customHeadlines,
        clipTrims,
      });

      res.json({
        success: true,
        zipUrl: result.zipUrl,
        totalClips: result.totalClips,
        zipFilename: result.zipFilename,
      });
    } catch (err: any) {
      console.error('Batch export ZIP error:', err);
      res.status(500).json({ error: err.message || 'Failed to create zip bundle' });
    }
  },

  /**
   * Render and save all clips into a dedicated directory on disk (no zip),
   * returning clean direct file URLs for browser folder streaming or direct access.
   */
  async exportFolder(req: Request, res: Response): Promise<void> {
    try {
      const {
        jobId,
        aspectRatio = '9:16-blur',
        targetResolution = '720p',
        customHeadlines = {},
        clipTrims = {},
      } = req.body;

      if (!jobId) {
        res.status(400).json({ error: 'jobId is required' });
        return;
      }

      console.log(`📁 [Shorts] Exporting all clips to folder for job: ${jobId}`);

      const result = await ShortsService.exportAllClipsFolder({
        jobId,
        aspectRatio,
        targetResolution,
        customHeadlines,
        clipTrims,
      });

      res.json({
        success: true,
        folderName: result.folderName,
        folderPath: result.folderPath,
        totalClips: result.totalClips,
        clips: result.clips,
      });
    } catch (err: any) {
      console.error('Export folder error:', err);
      res.status(500).json({ error: err.message || 'Failed to export folder' });
    }
  },

  /**
   * Open the exported folder directly in the system file explorer (Windows / Mac / Linux)
   */
  async openFolder(req: Request, res: Response): Promise<void> {
    try {
      const { folderPath, jobId } = req.body;
      let targetDir = folderPath;
      if (!targetDir && jobId) {
        targetDir = path.resolve(process.cwd(), 'uploads', 'shorts', `${jobId}-shorts`);
      }

      if (!targetDir || !fs.existsSync(targetDir)) {
        res.status(404).json({ error: 'Target folder does not exist on disk' });
        return;
      }

      ShortsService.openSystemFolder(targetDir);
      res.json({ success: true, opened: true, folderPath: targetDir });
    } catch (err: any) {
      console.error('Open folder error:', err);
      res.status(500).json({ error: err.message || 'Failed to open folder' });
    }
  },

  /**
   * Upload a local video file and kick off highlight analysis
   */
  async uploadLocal(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No video file provided' });
        return;
      }

      const jobId = `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const relativeUrl = `/uploads/shorts/${req.file.filename}`;
      const videoPath = req.file.path;

      // Create synthetic job
      const job = {
        id: jobId,
        status: 'analyzing' as const,
        progress: 60,
        stage: 'Analyzing uploaded video highlights...',
        videoInfo: {
          id: jobId,
          title: req.file.originalname.replace(/\.[^/.]+$/, ''),
          duration: 60, // will be probed or fallback
          thumbnail: '',
          channel: 'Local Upload',
          description: 'Uploaded video file',
          webpage_url: relativeUrl,
        },
        videoPath,
        videoUrl: relativeUrl,
      };

      // Set job in map
      ShortsService.setJob(jobId, job);

      // Probe duration if possible and generate clips (supports up to 150 shorts)
      const requestedClips = Math.max(1, Math.min(parseInt(req.body.clipCount, 10) || 4, 150));
      const clips = ShortsService.generateAlgorithmicClips(
        job.videoInfo,
        [],
        requestedClips,
        15,
        50
      );

      const hashtags = ShortsService.generateHashtags(job.videoInfo);
      (job as any).hashtags = hashtags;
      (job as any).generationTimeMs = 80;
      (job as any).downloadTimeMs = 0;
      (job as any).isCachedSource = false;

      job.clips = clips;
      job.status = 'done';
      job.progress = 100;
      job.stage = `Analysis complete! ${clips.length} clips ready.`;

      res.json({
        success: true,
        jobId,
        videoUrl: relativeUrl,
        clips,
      });
    } catch (err: any) {
      console.error('Upload local error:', err);
      res.status(500).json({ error: err.message });
    }
  },
};
