import { Router } from 'express';
import { EditorService } from '../services/editor.service';
import { EditorController } from '../controllers/editor.controller';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure Multer for Editor Assets
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `editor-${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

router.post('/render', EditorController.renderProject);
router.get('/render/status/:jobId', EditorController.getRenderStatus);

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
