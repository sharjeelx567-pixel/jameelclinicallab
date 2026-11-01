import type { BridgeConfig } from '../config/config';
import type { QueuedMessage } from '../queue/file-queue';

export class PermanentError extends Error {}

/** Authenticated HTTPS client for the LIS backend's bridge endpoints. */
export class BackendClient {
  constructor(private readonly cfg: BridgeConfig) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.cfg.backendUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Bridge-Id': this.cfg.bridgeId, Authorization: `Bridge ${this.cfg.bridgeToken}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new Error(`Network error: ${(err as Error).message}`);
    }
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
    if (res.ok) return json.data as T;
    const msg = `${res.status} ${json.error?.code ?? ''} ${json.error?.message ?? ''}`.trim();
    // 4xx (except 408/429) won't succeed on retry: auth/validation/config problems.
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) throw new PermanentError(msg);
    throw new Error(msg);
  }

  sendMessage(m: QueuedMessage) {
    return this.post<{ id: string; status: string }>('/analyzers/bridge/messages', {
      analyzerId: m.analyzerId,
      raw: m.raw,
      protocol: m.protocol,
      isDemo: m.isDemo,
      sampleIdentifier: m.sampleIdentifier,
      results: m.results,
      parseErrors: m.parseErrors,
    });
  }

  heartbeat(analyzers: Array<{ analyzerId: string; state: 'connected' | 'disconnected' | 'error'; mode: 'live' | 'demo'; error?: string }>) {
    return this.post<{ accepted: string[] }>('/analyzers/bridge/heartbeat', { analyzers });
  }
}
