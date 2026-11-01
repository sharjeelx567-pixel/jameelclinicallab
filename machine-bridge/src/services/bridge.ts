import { createServer, Server } from 'node:http';
import type { BridgeConfig } from '../config/config';
import { AnalyzerDriver, createDriver, DriverMessage } from '../drivers/drivers';
import { FileQueue } from '../queue/file-queue';
import { BackendClient, PermanentError } from './backend-client';
import { log } from './logger';

/** Orchestrates drivers → durable queue → backend, plus heartbeat and local health endpoint. */
export class Bridge {
  private readonly drivers: AnalyzerDriver[];
  private readonly queue: FileQueue;
  private readonly client: BackendClient;
  private timers: NodeJS.Timeout[] = [];
  private health?: Server;
  private flushing = false;
  private lastBackendOk?: string;
  private lastBackendError?: string;

  constructor(private readonly cfg: BridgeConfig) {
    this.queue = new FileQueue(cfg.queueDir);
    this.client = new BackendClient(cfg);
    this.drivers = cfg.analyzers.map(createDriver);
  }

  async start() {
    for (const d of this.drivers) {
      d.on('message', (m: DriverMessage) => this.onMessage(m));
      await d.start().catch((e: Error) => log.error(`${d.cfg.name}: failed to start — ${e.message}`));
    }
    this.timers.push(setInterval(() => void this.flush(), 5000));
    this.timers.push(setInterval(() => void this.heartbeat(), this.cfg.heartbeatSeconds * 1000));
    void this.heartbeat();
    void this.flush();
    this.startHealthServer();
    log.info(`Bridge ${this.cfg.bridgeId} started with ${this.drivers.length} analyzer(s)`);
  }

  async stop() {
    this.timers.forEach(clearInterval);
    await Promise.all(this.drivers.map((d) => d.stop()));
    this.health?.close();
  }

  private onMessage(m: DriverMessage) {
    const { id, duplicate } = this.queue.enqueue({
      analyzerId: m.analyzerId,
      protocol: m.protocol,
      isDemo: m.isDemo,
      raw: m.raw,
      sampleIdentifier: m.parsed.sampleIdentifier,
      results: m.parsed.results,
      parseErrors: m.parsed.errors,
      receivedAt: new Date().toISOString(),
    });
    log.info(`Message ${id.slice(0, 12)} from ${m.analyzerId}${m.isDemo ? ' [DEMO]' : ''}: ${m.parsed.results.length} result(s), ${m.parsed.errors.length} parse error(s)${duplicate ? ' — duplicate, ignored' : ''}`);
    void this.flush();
  }

  /** Sends due messages in order. Network/5xx → retry with backoff; permanent 4xx → failed/. */
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const m of this.queue.due()) {
        try {
          const res = await this.client.sendMessage(m);
          this.queue.ack(m.id);
          this.lastBackendOk = new Date().toISOString();
          log.info(`Delivered ${m.id.slice(0, 12)} → ${res.status}`);
        } catch (err) {
          const msg = (err as Error).message;
          this.lastBackendError = msg;
          if (err instanceof PermanentError) {
            this.queue.moveToFailed(m, msg);
            log.error(`Message ${m.id.slice(0, 12)} rejected by backend (${msg}); moved to failed/ for review`);
          } else {
            this.queue.retryLater(m, msg);
            log.warn(`Delivery failed for ${m.id.slice(0, 12)} (${msg}); will retry`);
            break; // backend unreachable — keep order, try later
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private async heartbeat() {
    const analyzers = this.drivers.map((d) => {
      const s = d.status();
      const state: 'connected' | 'disconnected' | 'error' = s.link === 'connected' ? 'connected' : s.link === 'error' ? 'error' : 'disconnected';
      return { analyzerId: s.analyzerId, mode: s.mode, state, error: s.lastError };
    });
    try {
      await this.client.heartbeat(analyzers);
      this.lastBackendOk = new Date().toISOString();
    } catch (err) {
      this.lastBackendError = (err as Error).message;
      log.warn(`Heartbeat failed: ${this.lastBackendError}`);
    }
  }

  status() {
    return {
      bridgeId: this.cfg.bridgeId,
      backendUrl: this.cfg.backendUrl,
      backend: { lastOkAt: this.lastBackendOk, lastError: this.lastBackendError },
      queue: this.queue.depth(),
      analyzers: this.drivers.map((d) => d.status()),
      time: new Date().toISOString(),
    };
  }

  /** Local status page — bound to 127.0.0.1 only; exposes no message contents. */
  private startHealthServer() {
    this.health = createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(this.status(), null, 2));
        return;
      }
      res.writeHead(404).end();
    });
    this.health.listen(this.cfg.healthPort, '127.0.0.1', () => log.info(`Local status: http://127.0.0.1:${this.cfg.healthPort}/health`));
  }
}
