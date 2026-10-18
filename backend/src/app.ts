import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import teamsRoutes from './routes/teams.routes';
import workItemsRoutes from './routes/workItems.routes';
import outboxRoutes from './routes/outbox.routes';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-idempotency-key'],
    exposedHeaders: ['Idempotency-Replayed', 'X-Cache-Lookup'],
  })
);

app.use(express.json({ limit: '2mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'newtonite-operations-under-pressure',
  });
});

// Application Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamsRoutes);
app.use('/api/work-items', workItemsRoutes);
app.use('/api/outbox', outboxRoutes);

// Error Handling Middleware
app.use(errorHandler);
