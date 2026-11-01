import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { loadDotEnv } from './config/load-dotenv';

async function main() {
  loadDotEnv();
  // Import after .env is loaded so module-level config sees the values.
  const { getEnv } = await import('./config/env');
  const { createApp } = await import('./bootstrap');
  const env = getEnv();
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(env.PORT);

  const logger = new Logger('Bootstrap');
  logger.log(`API listening on http://localhost:${env.PORT}/api/v1  (docs: /api/docs)`);
  if (env.DATA_BACKEND === 'memory') logger.warn('DATA_BACKEND=memory — DEVELOPMENT ONLY, data is not persisted.');
  if (env.AUTH_MODE === 'dev') logger.warn('AUTH_MODE=dev — DEVELOPMENT ONLY, Firebase token verification is bypassed.');
}

main().catch((err: Error) => {
  console.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
