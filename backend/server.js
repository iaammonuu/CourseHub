/**
 * CourseHub Backend Server Entry Point (Standalone / Reference)
 * Note: In the unified full-stack runtime, root `server.ts` mounts this API router
 * and serves both the frontend HTML pages and Vite assets on Port 3000.
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { connectDatabase } from './config/db';
import apiRouter from './routes/apiRoutes';

dotenv.config();

export async function createBackendApp() {
  await connectDatabase();
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use('/api', apiRouter);

  const frontendDir = path.resolve(process.cwd(), 'frontend');
  app.use(express.static(frontendDir));

  return app;
}
