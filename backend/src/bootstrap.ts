import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { getEnv } from './config/env';
import { DataStore } from './database/data-store';
import { checkDatabase } from './database/database-health';
import { seedDevelopmentData } from './database/seed';

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export async function createApp(options: { logger?: boolean } = {}): Promise<INestApplication> {
  const env = getEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: options.logger === false ? false : ['log', 'warn', 'error'],
  });
  app.set('trust proxy', 1);
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/database'] });
  app.use(helmet());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Bridge-Id', 'Idempotency-Key'],
    maxAge: 600,
  });

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('JAMEEL CLINICAL LABORATORY — LIS API')
      .setDescription('Accurate Diagnosis, Better Healthcare. Private API for authorised laboratory staff.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  // Serverless cold starts skip this round trip (it adds seconds); GET /health/database is still available.
  const db = process.env.VERCEL ? { persistent: true, ok: true, emulator: false, projectId: env.FIREBASE_PROJECT_ID, latencyMs: 0, error: undefined } : await checkDatabase(app.get(DataStore));
  const log = new Logger('Database');
  if (!db.persistent) log.warn('⚠ IN-MEMORY data store — records are NOT saved and disappear when the server stops. Set DATA_BACKEND=firestore.');
  else if (db.ok) log.log(`✓ Firestore ${db.emulator ? 'EMULATOR' : 'project'} "${db.projectId}" reachable (write + read-back ${db.latencyMs} ms)`);
  else log.error(`✗ Firestore NOT reachable: ${db.error}. Requests that use the database will fail until this is fixed.`);

  if (env.SEED_DEMO_DATA) {
    await seedDevelopmentData(app.get(DataStore));
    new Logger('Seed').warn('⚠ DEMO users and catalogue structure seeded (development only).');
  }
  return app;
}
