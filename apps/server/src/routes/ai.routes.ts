import { Router } from 'express';
import { AIController } from '../controllers/ai.controller';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure Multer for Absolute Paths
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `upload-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

/**
 * ⚡ REDIRECT: Bypass OpenAI 'generate-script' and go straight to video synthesis
 * This resolves the 429 Quota Exceeded error.
 */
router.post('/generate-script', AIController.generateScript);

router.post('/stitch-images', upload.fields([{ name: 'images', maxCount: 20 }, { name: 'audio', maxCount: 1 }]), AIController.stitchImages);
router.post('/transcribe', upload.single('video'), AIController.transcribe);
router.post('/generate-voiceover', AIController.generateVoiceover);
router.post('/prompt-timeline', AIController.generateTimeline);

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

router.get('/freesound-search', AIController.freesoundSearch);
router.get('/giphy-search', AIController.giphySearch);

export default router;

// Trigger restart
