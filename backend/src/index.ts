import { app } from './app';
import { config } from './config';
import { startOutboxWorker } from './worker/outboxWorker';

const server = app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`🚀 Newtonite Ops Server running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Health Check: http://localhost:${config.port}/api/health`);
  console.log(`====================================================`);

  // Start the background outbox worker
  startOutboxWorker(config.workerPollIntervalMs);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
