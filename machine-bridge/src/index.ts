import { loadConfig } from './config/config';
import { Bridge } from './services/bridge';
import { log } from './services/logger';

async function main() {
  const cfg = loadConfig();
  if (!cfg.analyzers.length) log.warn('No enabled analyzers in configuration — the bridge will only send heartbeats.');
  const bridge = new Bridge(cfg);
  await bridge.start();
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal}; shutting down (queued messages are kept on disk)`);
    await bridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: Error) => {
  log.error(`Fatal: ${err.message}`);
  process.exit(1);
});
