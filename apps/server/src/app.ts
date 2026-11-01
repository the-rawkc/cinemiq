import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import aiRoutes from './routes/ai.routes';
import editorRoutes from './routes/editor.routes';
import shortsRoutes from './routes/shorts.routes';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use((req, res, next) => {
  console.log(`📡 [${req.method}] ${req.url}`);
  next();
});
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Routes
app.use('/api/ai', aiRoutes);
app.use('/api/editor', editorRoutes);
app.use('/api/shorts', shortsRoutes);

app.get('/', (req, res) => {
  res.json({ 
    message: 'Cinemiq API is online (Simplified Mode)', 
    version: '1.0.0',
    endpoints: {
      health: '/health',
      ai: '/api/ai',
      editor: '/api/editor',
      shorts: '/api/shorts'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Cinemiq Backend is running' });
});

export default app;
