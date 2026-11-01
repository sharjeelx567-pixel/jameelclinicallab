import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Protocol = 'astm' | 'hl7';

export type ConnectorConfig =
  | { type: 'tcp-server'; host: string; port: number }
  | { type: 'tcp-client'; host: string; port: number }
  | { type: 'serial'; path: string; baudRate: number; dataBits?: 7 | 8; parity?: 'none' | 'even' | 'odd'; stopBits?: 1 | 2 }
  | { type: 'demo'; intervalSeconds: number };

export interface AnalyzerConfig {
  analyzerId: string;
  name: string;
  /** "demo" analyzers send clearly-flagged simulated messages that the LIS never applies to patients. */
  mode: 'live' | 'demo';
  enabled?: boolean;
  protocol: Protocol;
  connector: ConnectorConfig;
}

export interface BridgeConfig {
  backendUrl: string;
  bridgeId: string;
  bridgeToken: string;
  queueDir: string;
  healthPort: number;
  heartbeatSeconds: number;
  analyzers: AnalyzerConfig[];
}

function loadDotEnv(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i.exec(line);
    if (m && !line.trimStart().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function fail(msg: string): never {
  throw new Error(`Configuration error: ${msg}`);
}

export function validateAnalyzer(a: Partial<AnalyzerConfig>, i: number): AnalyzerConfig {
  const where = `analyzers[${i}]`;
  if (!a.analyzerId || typeof a.analyzerId !== 'string') fail(`${where}.analyzerId is required`);
  if (a.mode !== 'live' && a.mode !== 'demo') fail(`${where}.mode must be "live" or "demo"`);
  if (a.protocol !== 'astm' && a.protocol !== 'hl7') fail(`${where}.protocol must be "astm" or "hl7"`);
  const c = a.connector as ConnectorConfig | undefined;
  if (!c) fail(`${where}.connector is required`);
  if (c.type === 'demo' && a.mode !== 'demo') fail(`${where}: a demo connector can only be used with mode "demo"`);
  if (a.mode === 'demo' && c.type !== 'demo') fail(`${where}: mode "demo" requires connector type "demo"`);
  if ((c.type === 'tcp-server' || c.type === 'tcp-client') && !(c.port > 0 && c.port < 65536)) fail(`${where}.connector.port is invalid`);
  if (c.type === 'serial' && (!c.path || !c.baudRate)) fail(`${where}.connector needs path and baudRate`);
  return { name: a.analyzerId, enabled: true, ...a } as AnalyzerConfig;
}

export function loadConfig(): BridgeConfig {
  loadDotEnv(resolve(process.cwd(), '.env'));
  const file = resolve(process.cwd(), process.env.BRIDGE_CONFIG ?? './bridge.config.json');
  if (!existsSync(file)) fail(`analyzer config not found at ${file} (copy bridge.config.example.json)`);
  const raw = JSON.parse(readFileSync(file, 'utf8')) as { heartbeatSeconds?: number; analyzers?: Partial<AnalyzerConfig>[] };
  const token = process.env.BRIDGE_TOKEN ?? '';
  if (token.length < 16) fail('BRIDGE_TOKEN is missing or too short (use a random 32+ byte hex token)');
  return {
    backendUrl: (process.env.BACKEND_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, ''),
    bridgeId: process.env.BRIDGE_ID ?? fail('BRIDGE_ID is required'),
    bridgeToken: token,
    queueDir: resolve(process.cwd(), process.env.QUEUE_DIR ?? './data/queue'),
    healthPort: Number(process.env.HEALTH_PORT ?? 4100),
    heartbeatSeconds: Math.max(10, raw.heartbeatSeconds ?? 30),
    analyzers: (raw.analyzers ?? []).map(validateAnalyzer).filter((a) => a.enabled !== false),
  };
}
