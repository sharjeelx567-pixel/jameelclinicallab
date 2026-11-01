import { EventEmitter } from 'node:events';
import net from 'node:net';
import type { ConnectorConfig } from '../config/config';
import { log } from '../services/logger';

export type LinkState = 'starting' | 'listening' | 'connected' | 'disconnected' | 'error';

/**
 * Byte transport to an analyzer. "connected" is reported ONLY when a real socket
 * or serial port is open — it is never assumed.
 */
export abstract class Connector extends EventEmitter {
  state: LinkState = 'starting';
  lastError?: string;
  lastDataAt?: string;

  protected setState(state: LinkState, error?: string) {
    this.state = state;
    if (error) this.lastError = error;
    this.emit('state', state);
  }

  protected onData(chunk: Buffer) {
    this.lastDataAt = new Date().toISOString();
    this.emit('data', chunk);
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract write(data: Buffer): void;
}

/** Bridge listens; the analyzer connects as a TCP client (common for ASTM over TCP). */
export class TcpServerConnector extends Connector {
  private server?: net.Server;
  private socket?: net.Socket;

  constructor(private readonly cfg: Extract<ConnectorConfig, { type: 'tcp-server' }>, private readonly label: string) {
    super();
  }

  async start() {
    this.server = net.createServer((socket) => {
      if (this.socket) {
        log.warn(`${this.label}: rejecting second connection from ${socket.remoteAddress}`);
        socket.destroy();
        return;
      }
      this.socket = socket;
      socket.setKeepAlive(true, 30_000);
      log.info(`${this.label}: analyzer connected from ${socket.remoteAddress}`);
      this.setState('connected');
      socket.on('data', (c) => this.onData(c));
      socket.on('error', (e) => this.setState('error', e.message));
      socket.on('close', () => {
        this.socket = undefined;
        this.setState('listening');
        log.warn(`${this.label}: analyzer disconnected`);
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.cfg.port, this.cfg.host, () => resolve());
    });
    this.setState('listening');
    log.info(`${this.label}: listening on ${this.cfg.host}:${this.cfg.port}`);
  }

  async stop() {
    this.socket?.destroy();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
    this.setState('disconnected');
  }

  write(data: Buffer) {
    this.socket?.write(data);
  }
}

/** Bridge connects to the analyzer's TCP port, reconnecting with exponential backoff. */
export class TcpClientConnector extends Connector {
  private socket?: net.Socket;
  private stopped = false;
  private attempt = 0;
  private timer?: NodeJS.Timeout;

  constructor(private readonly cfg: Extract<ConnectorConfig, { type: 'tcp-client' }>, private readonly label: string) {
    super();
  }

  async start() {
    this.stopped = false;
    this.connect();
  }

  private connect() {
    if (this.stopped) return;
    const socket = net.createConnection({ host: this.cfg.host, port: this.cfg.port });
    this.socket = socket;
    socket.setKeepAlive(true, 30_000);
    socket.on('connect', () => {
      this.attempt = 0;
      log.info(`${this.label}: connected to ${this.cfg.host}:${this.cfg.port}`);
      this.setState('connected');
    });
    socket.on('data', (c) => this.onData(c));
    socket.on('error', (e) => this.setState('error', e.message));
    socket.on('close', () => {
      if (this.stopped) return;
      const delay = Math.min(60_000, 1000 * 2 ** this.attempt++);
      if (this.state !== 'error') this.setState('disconnected');
      log.warn(`${this.label}: connection closed; retrying in ${Math.round(delay / 1000)}s`);
      this.timer = setTimeout(() => this.connect(), delay);
    });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.socket?.destroy();
    this.setState('disconnected');
  }

  write(data: Buffer) {
    this.socket?.write(data);
  }
}

interface SerialPortLike {
  on(event: 'data', cb: (c: Buffer) => void): void;
  on(event: 'error', cb: (e: Error) => void): void;
  on(event: 'close' | 'open', cb: () => void): void;
  open(cb: (err: Error | null) => void): void;
  close(cb?: () => void): void;
  write(data: Buffer): void;
  isOpen: boolean;
}

/** RS-232 via the optional `serialport` package. Reopens on failure. */
export class SerialConnector extends Connector {
  private port?: SerialPortLike;
  private stopped = false;
  private timer?: NodeJS.Timeout;

  constructor(private readonly cfg: Extract<ConnectorConfig, { type: 'serial' }>, private readonly label: string) {
    super();
  }

  async start() {
    let SerialPort: new (opts: Record<string, unknown>) => SerialPortLike;
    try {
      ({ SerialPort } = (await import('serialport')) as unknown as { SerialPort: typeof SerialPort });
    } catch {
      this.setState('error', 'The "serialport" package is not installed on this PC (npm install serialport)');
      log.error(`${this.label}: ${this.lastError}`);
      return;
    }
    this.port = new SerialPort({
      path: this.cfg.path,
      baudRate: this.cfg.baudRate,
      dataBits: this.cfg.dataBits ?? 8,
      parity: this.cfg.parity ?? 'none',
      stopBits: this.cfg.stopBits ?? 1,
      autoOpen: false,
    });
    this.port.on('data', (c) => this.onData(c));
    this.port.on('error', (e) => this.setState('error', e.message));
    this.port.on('close', () => {
      if (this.stopped) return;
      this.setState('disconnected');
      this.timer = setTimeout(() => this.open(), 5000);
    });
    this.open();
  }

  private open() {
    if (this.stopped || !this.port || this.port.isOpen) return;
    this.port.open((err) => {
      if (err) {
        this.setState('error', err.message);
        log.warn(`${this.label}: cannot open ${this.cfg.path}: ${err.message}; retrying in 10s`);
        this.timer = setTimeout(() => this.open(), 10_000);
        return;
      }
      log.info(`${this.label}: serial port ${this.cfg.path} open @ ${this.cfg.baudRate}`);
      this.setState('connected');
    });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await new Promise<void>((r) => (this.port?.isOpen ? this.port.close(() => r()) : r()));
    this.setState('disconnected');
  }

  write(data: Buffer) {
    this.port?.write(data);
  }
}
