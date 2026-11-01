import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { ShortsService } from '../services/shorts.service';

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

      const jobId = await ShortsService.startAnalysisJob(
        url.trim(),
        Math.max(1, Math.min(parseInt(clipCount, 10) || 4, 25)),
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
        startTime = 0,
        endTime = 30,
        aspectRatio = '9:16-blur',
        headlineText = '',
      } = req.body;

      if (!sourceVideoUrl) {
        res.status(400).json({ error: 'sourceVideoUrl is required' });
        return;
      }

      // Convert URL to absolute disk path
      let diskPath: string;
      if (sourceVideoUrl.startsWith('http')) {
        const parsed = new URL(sourceVideoUrl);
        diskPath = path.resolve(process.cwd(), parsed.pathname.replace(/^\//, ''));
      } else {
        diskPath = path.resolve(process.cwd(), sourceVideoUrl.replace(/^\//, ''));
      }

      if (!fs.existsSync(diskPath)) {
        res.status(404).json({ error: `Source video not found: ${diskPath}` });
        return;
      }

      console.log(`🎬 [Shorts] Rendering clip: ${startTime}s -> ${endTime}s, ratio: ${aspectRatio}`);

      const result = await ShortsService.renderShortClip({
        sourceVideoPath: diskPath,
        startTime: parseFloat(startTime),
        endTime: parseFloat(endTime),
        aspectRatio,
        headlineText,
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
      (ShortsService as any).activeJobs?.set?.(jobId, job);

      // Probe duration if possible and generate clips
      const clips = ShortsService.generateAlgorithmicClips(
        job.videoInfo,
        [],
        4,
        15,
        50
      );

      job.clips = clips;
      job.status = 'done';
      job.progress = 100;
      job.stage = 'Analysis complete!';

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
