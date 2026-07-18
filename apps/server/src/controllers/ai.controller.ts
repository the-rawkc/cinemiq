import { Request, Response } from 'express';
import { AIService } from '../services/ai.service';
import { AIOrchestratorService } from '../services/ai_orchestrator.service';

export const AIController = {
  generateScript: async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

      console.log('--- RECEIVED GENERATION REQUEST ---');
      const result = await AIService.generateVideoFromPrompt(prompt);
      res.json(result);
    } catch (error: any) {
      console.error('AI Generation Error:', error.message);
      // If DALL-E fails (e.g. Quota), we still want to return a 200 to trigger the frontend fallback
      res.status(200).json({ error: error.message, fallback: true });
    }
  },

  transcribe: async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body;
      if (!filePath) return res.status(400).json({ error: 'File path is required' });

      const transcription = await AIService.transcribeVideo(filePath);
      res.json(transcription);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  generateVoiceover: async (req: Request, res: Response) => {
    try {
      const { text, voice } = req.body;
      const result = await AIService.generateVoiceover(text, voice);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  stitchImages: async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const images = files['images'] || [];
      const audio = files['audio']?.[0];
      const { duration, transition, textOverlay, shapeType, shapeColor, imageSettings } = req.body;
      
      console.log('📸 RECEIVED STITCH REQUEST - Images:', images.length, 'Audio:', audio?.filename, 'Settings:', { duration, transition });
      
      if (images.length === 0) {
        return res.status(400).json({ error: 'No images received' });
      }

      let durations: number[] | undefined;
      let zooms: boolean[] | undefined;
      let textOverlays: string[] | undefined;
      if (imageSettings) {
        try {
          const parsed = JSON.parse(imageSettings);
          durations = parsed.durations;
          zooms = parsed.zooms;
          textOverlays = parsed.textOverlays;
          // Support new per-image visual settings
          const filters = parsed.filters;
          const intensities = parsed.intensities;
          // Pass them through by attaching to the options below
          Object.assign(req.body, { _parsedFilters: filters, _parsedIntensities: intensities });
        } catch (e) {
          console.error('Failed to parse imageSettings JSON:', e);
        }
      }

      const result = await AIService.stitchImages(images, { 
        duration: parseInt(duration), 
        transition,
        audioFile: audio,
        textOverlay,
        shapeType,
        shapeColor,
        durations,
        zooms,
        textOverlays,
        filters: (req.body as any)._parsedFilters,
        intensities: (req.body as any)._parsedIntensities
      });
      res.json(result);
    } catch (error: any) {
      console.error('❌ Stitching Error:', error.message);
      res.status(500).json({ error: error.message });
    }
  },
  freesoundSearch: async (req: Request, res: Response) => {
    try {
      const { query } = req.query;
      if (!query) return res.status(400).json({ error: 'Query is required' });
      const results = await AIService.freesoundSearch(query.toString());
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
  giphySearch: async (req: Request, res: Response) => {
    try {
      const { query, type } = req.query;
      if (!query) return res.status(400).json({ error: 'Query is required' });
      const results = await AIService.giphySearch(query.toString(), (type as any) || 'gifs');
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
  generateTimeline: async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

      console.log(`🧠 AI Timeline generation prompt: "${prompt}"`);
      const timelineProject = await AIOrchestratorService.generateTimeline(prompt);
      res.json(timelineProject);
    } catch (error: any) {
      console.error('AI Timeline Generation failed:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
};
