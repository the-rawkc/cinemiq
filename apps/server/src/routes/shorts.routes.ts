import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ShortsController } from '../controllers/shorts.controller';

const router = Router();

// Configure Multer for Shorts video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve(process.cwd(), 'uploads', 'shorts');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
});

// YouTube Metadata
router.post('/info', ShortsController.getInfo);

// Kick off async Download & AI Highlight Analysis Job
router.post('/analyze', ShortsController.analyze);

// Check Job Status
router.get('/status/:jobId', ShortsController.getStatus);

// Render Short Clip (9:16 blurred/crop + text overlay)
router.post('/render-clip', ShortsController.renderClip);

// Direct force-download endpoint with attachment disposition
router.get('/download-file', ShortsController.downloadFile);

// Render & Download All Clips in a Single ZIP Archive
router.post('/download-all-zip', ShortsController.downloadAllZip);

// Render and export all clips into a dedicated loose folder on disk (no zip)
router.post('/export-folder', ShortsController.exportFolder);

// Open exported folder directly in system File Explorer (Windows explorer / Mac Finder / Linux)
router.post('/open-folder', ShortsController.openFolder);

// Upload Local Video directly
router.post('/upload-local', upload.single('video'), ShortsController.uploadLocal);

export default router;
