import { CommandBuilder, RenderProject } from '../ffmpeg/CommandBuilder';
import path from 'path';
import fs from 'fs';

export interface RenderJob {
  id: string;
  project: RenderProject;
  status: 'pending' | 'processing' | 'done' | 'failed';
  progress: number;
  outputPath?: string;
  error?: string;
  createdAt: Date;
}

class RenderQueue {
  private jobs: Map<string, RenderJob> = new Map();
  private queue: string[] = [];
  private isProcessing = false;

  createJob(project: RenderProject): string {
    const id = Math.random().toString(36).substring(2, 9);
    
    const job: RenderJob = {
      id,
      project,
      status: 'pending',
      progress: 0,
      createdAt: new Date()
    };

    this.jobs.set(id, job);
    this.queue.push(id);
    
    // Trigger queue processing asynchronously
    this.processQueue();

    return id;
  }

  getJob(id: string): RenderJob | undefined {
    return this.jobs.get(id);
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const jobId = this.queue.shift()!;
    const job = this.jobs.get(jobId);

    if (!job) {
      this.isProcessing = false;
      this.processQueue();
      return;
    }

    job.status = 'processing';
    console.log(`🎬 Queue Processing Render Job: ${jobId}`);

    try {
      const outputName = `render-${jobId}-${Date.now()}.mp4`;
      const uploadDir = path.resolve(process.cwd(), 'uploads');
      
      // Ensure upload directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const outputPath = path.join(uploadDir, outputName);
      const cmd = CommandBuilder.build(job.project, outputPath);

      const totalDuration = job.project.clips.length > 0
        ? Math.max(...job.project.clips.map(c => c.offset + c.duration))
        : 5;

      await new Promise<void>((resolve, reject) => {
        cmd
          .on('start', (cmdLine) => {
            console.log(`FFmpeg Job Spawned: ${cmdLine}`);
          })
          .on('progress', (progressInfo) => {
            // progressInfo.timemark format: "00:00:05.12"
            if (progressInfo.timemark) {
              const parts = progressInfo.timemark.split(':');
              const secs = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
              const percent = Math.min(99, Math.round((secs / totalDuration) * 100));
              
              job.progress = percent;
              this.jobs.set(jobId, { ...job });
              console.log(`Job [${jobId}] Rendering progress: ${percent}%`);
            }
          })
          .on('error', (err) => {
            console.error(`Rendering Fail Job [${jobId}]:`, err.message);
            reject(err);
          })
          .on('end', () => {
            console.log(`Rendering Success Job [${jobId}] Output: ${outputName}`);
            job.status = 'done';
            job.progress = 100;
            job.outputPath = `/uploads/${outputName}`;
            this.jobs.set(jobId, { ...job });
            resolve();
          })
          .save(outputPath);
      });

    } catch (err: any) {
      job.status = 'failed';
      job.error = err.message;
      this.jobs.set(jobId, { ...job });
    } finally {
      this.isProcessing = false;
      // Loop to next job in queue
      this.processQueue();
    }
  }
}

export const renderQueue = new RenderQueue();
export default renderQueue;
