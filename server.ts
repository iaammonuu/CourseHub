import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { connectDatabase } from './backend/config/db';
import apiRouter from './backend/routes/apiRoutes';

dotenv.config();

const PORT = 3000;

async function startServer() {
  await connectDatabase();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  // Mount CourseHub REST API
  app.use('/api', apiRouter);

  // Serve Vanilla HTML5/CSS3/JS files from /frontend
  const frontendDir = path.resolve(process.cwd(), 'frontend');
  if (fs.existsSync(frontendDir)) {
    app.use('/frontend', express.static(frontendDir));
    app.use('/css', express.static(path.join(frontendDir, 'css')));
    app.use('/js', express.static(path.join(frontendDir, 'js')));
    app.use('/assets', express.static(path.join(frontendDir, 'assets')));

    const htmlPages = [
      'login.html',
      'register.html',
      'student-dashboard.html',
      'faculty-dashboard.html',
      'admin-dashboard.html',
      'courses.html',
      'my-courses.html',
      'reports.html',
    ];

    for (const page of htmlPages) {
      app.get(`/${page}`, (_req, res) => {
        const target = path.join(frontendDir, page);
        if (fs.existsSync(target)) {
          res.sendFile(target);
        } else {
          res.redirect('/');
        }
      });
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CourseHub Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CourseHub server:', err);
  process.exit(1);
});
