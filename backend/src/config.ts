import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-newtonite-operations-key-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  workerPollIntervalMs: parseInt(process.env.WORKER_POLL_INTERVAL_MS || '2000', 10),
  workerBatchSize: parseInt(process.env.WORKER_BATCH_SIZE || '10', 10),
};
