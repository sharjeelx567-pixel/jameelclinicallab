/**
 * Vercel serverless entry point. The Nest app is created once per warm
 * instance and reused across requests; main.ts (app.listen) is not used here.
 */
import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadDotEnv } from './config/load-dotenv';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let ready: Promise<Handler> | undefined;

async function init(): Promise<Handler> {
  loadDotEnv();
  const { createApp } = await import('./bootstrap');
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  ready ??= init().catch((err: unknown) => {
    ready = undefined; // let the next request retry a failed cold start
    throw err;
  });
  const app = await ready;
  app(req, res);
}
