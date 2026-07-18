import { Request, Response } from 'express';
import { renderQueue } from '../core/jobs/RenderQueue';

export const EditorController = {
  renderProject: async (req: Request, res: Response) => {
    try {
      const { project } = req.body;
      if (!project) {
        return res.status(400).json({ error: 'Project configuration is required' });
      }

      console.log(`🎬 Received background rendering request for Project: "${project.name}"`);
      const jobId = renderQueue.createJob(project);
      
      res.status(202).json({ 
        message: 'Render job queued successfully', 
        jobId 
      });
    } catch (error: any) {
      console.error('Error queuing rendering job:', error.message);
      res.status(500).json({ error: error.message });
    }
  },

  getRenderStatus: async (req: Request, res: Response) => {
    try {
      const { jobId } = req.params;
      if (!jobId) {
        return res.status(400).json({ error: 'Job ID parameter is required' });
      }

      const job = renderQueue.getJob(jobId);
      if (!job) {
        return res.status(404).json({ error: `Render job with ID "${jobId}" not found` });
      }

      res.json({
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        outputPath: job.outputPath,
        error: job.error
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
};
