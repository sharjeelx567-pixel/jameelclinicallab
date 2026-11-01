import { EventEmitter } from 'node:events';
import type { AnalyzerConfig } from '../config/config';
import { Connector, SerialConnector, TcpClientConnector, TcpServerConnector } from '../connectors/connector';
import { AstmLowLevelReceiver } from '../protocols/astm-framing';
import { parseAstm } from '../parsers/astm-parser';
import { buildHl7Ack, parseHl7, unwrapMllp, wrapMllp } from '../parsers/hl7-parser';
import type { ParsedMessage } from '../parsers/types';
import { log } from '../services/logger';

export interface DriverMessage {
  analyzerId: string;
  protocol: 'astm' | 'hl7';
  isDemo: boolean;
  raw: string;
  parsed: ParsedMessage;
}

export interface DriverStatus {
  analyzerId: string;
  name: string;
  mode: 'live' | 'demo';
  protocol: string;
  link: string;
  lastError?: string;
  lastDataAt?: string;
  messages: number;
}

/** An analyzer driver: transport + protocol. Emits 'message' with DriverMessage. */
export abstract class AnalyzerDriver extends EventEmitter {
  messages = 0;
  constructor(readonly cfg: AnalyzerConfig) {
    super();
  }
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract status(): DriverStatus;

  protected emitMessage(raw: string, parsed: ParsedMessage, isDemo = false) {
    this.messages++;
    const m: DriverMessage = { analyzerId: this.cfg.analyzerId, protocol: this.cfg.protocol, isDemo, raw, parsed };
    this.emit('message', m);
  }
}

function makeConnector(cfg: AnalyzerConfig): Connector {
  const c = cfg.connector;
  switch (c.type) {
    case 'tcp-server':
      return new TcpServerConnector(c, cfg.name);
    case 'tcp-client':
      return new TcpClientConnector(c, cfg.name);
    case 'serial':
      return new SerialConnector(c, cfg.name);
    default:
      throw new Error(`Connector ${c.type} is not a live transport`);
  }
}

abstract class LiveDriver extends AnalyzerDriver {
  protected readonly connector: Connector;
  constructor(cfg: AnalyzerConfig) {
    super(cfg);
    this.connector = makeConnector(cfg);
  }
  start() {
    return this.connector.start();
  }
  stop() {
    return this.connector.stop();
  }
  status(): DriverStatus {
    return {
      analyzerId: this.cfg.analyzerId,
      name: this.cfg.name,
      mode: 'live',
      protocol: this.cfg.protocol,
      link: this.connector.state,
      lastError: this.connector.lastError,
      lastDataAt: this.connector.lastDataAt,
      messages: this.messages,
    };
  }
}

export class AstmDriver extends LiveDriver {
  private readonly receiver = new AstmLowLevelReceiver({
    reply: (b) => this.connector.write(Buffer.from([b])),
    message: (text) => this.emitMessage(text, parseAstm(text)),
    error: (reason) => log.warn(`${this.cfg.name}: ASTM framing — ${reason}`),
  });
  constructor(cfg: AnalyzerConfig) {
    super(cfg);
    this.connector.on('data', (c: Buffer) => this.receiver.push(c));
  }
}

export class Hl7Driver extends LiveDriver {
  private buffer: Buffer = Buffer.alloc(0);
  constructor(cfg: AnalyzerConfig) {
    super(cfg);
    this.connector.on('data', (c: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, c]);
      const { messages, rest } = unwrapMllp(this.buffer);
      this.buffer = rest.length > 1_000_000 ? Buffer.alloc(0) : rest;
      for (const m of messages) {
        const parsed = parseHl7(m);
        this.connector.write(wrapMllp(buildHl7Ack(m, parsed.errors.length && !parsed.results.length ? 'AE' : 'AA')));
        this.emitMessage(m, parsed);
      }
    });
  }
}

/**
 * DEMO driver. Produces clearly-labelled SIMULATED ASTM messages with DEMO sample
 * identifiers. Messages carry isDemo=true; the LIS stores them for UI testing but
 * never applies them to patient results and never reports the analyzer as connected.
 */
export class DemoDriver extends AnalyzerDriver {
  private timer?: NodeJS.Timeout;
  private seq = 0;

  async start() {
    const c = this.cfg.connector;
    const interval = c.type === 'demo' ? c.intervalSeconds : 60;
    log.warn(`${this.cfg.name}: DEMO MODE — simulated messages every ${interval}s (never applied to patients)`);
    this.timer = setInterval(() => this.tick(), interval * 1000);
  }

  private tick() {
    this.seq++;
    const raw = ['H|\\^&|||JCL-DEMO-SIMULATOR|||||||P|1', 'P|1', `O|1|DEMO-${String(this.seq).padStart(6, '0')}||^^^DEMO`, `R|1|^^^DEMO1|${(Math.random() * 10).toFixed(1)}|units||N||F`, 'L|1|N'].join('\r');
    this.emitMessage(raw, parseAstm(raw), true);
  }

  async stop() {
    clearInterval(this.timer);
  }

  status(): DriverStatus {
    return { analyzerId: this.cfg.analyzerId, name: this.cfg.name, mode: 'demo', protocol: this.cfg.protocol, link: 'simulated', messages: this.messages };
  }
}

export function createDriver(cfg: AnalyzerConfig): AnalyzerDriver {
  if (cfg.mode === 'demo') return new DemoDriver(cfg);
  return cfg.protocol === 'hl7' ? new Hl7Driver(cfg) : new AstmDriver(cfg);
}
