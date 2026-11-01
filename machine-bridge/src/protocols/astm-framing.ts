/**
 * ASTM E1381 (CLSI LIS1-A) low-level transfer protocol — receiver side.
 *
 *   Analyzer: ENQ            → Bridge: ACK
 *   Analyzer: STX FN text ETB|ETX C1 C2 CR LF → Bridge: ACK (checksum ok) / NAK
 *   Analyzer: EOT            → message complete
 *
 * This is the generic standard. Whether a specific BIOELAB model uses it (and
 * with which options) MUST be confirmed from that model's interface manual.
 */
export const ENQ = 0x05;
export const ACK = 0x06;
export const NAK = 0x15;
export const EOT = 0x04;
export const STX = 0x02;
export const ETX = 0x03;
export const ETB = 0x17;
export const CR = 0x0d;
export const LF = 0x0a;

/** Checksum: modulo-256 sum of bytes from FN through ETX/ETB inclusive, as 2 hex chars. */
export function astmChecksum(frameBody: Buffer): string {
  let sum = 0;
  for (const b of frameBody) sum = (sum + b) % 256;
  return sum.toString(16).toUpperCase().padStart(2, '0');
}

export function buildFrame(frameNumber: number, text: string, final = true): Buffer {
  const body = Buffer.concat([Buffer.from(String(frameNumber % 8)), Buffer.from(text, 'latin1'), Buffer.from([final ? ETX : ETB])]);
  return Buffer.concat([Buffer.from([STX]), body, Buffer.from(astmChecksum(body)), Buffer.from([CR, LF])]);
}

export interface FramingEvents {
  /** Bytes to write back to the analyzer (ACK / NAK). */
  reply(byte: number): void;
  /** A complete logical message (records separated by CR). */
  message(text: string): void;
  error(reason: string): void;
}

export class AstmLowLevelReceiver {
  private state: 'idle' | 'receiving' = 'idle';
  private buffer = Buffer.alloc(0);
  private text = '';
  private expectedFrame = 1;

  constructor(private readonly events: FramingEvents) {}

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // Guard against unbounded growth from a misbehaving device.
    if (this.buffer.length > 1_000_000) {
      this.events.error('Receive buffer overflow — discarding');
      this.reset();
      return;
    }
    this.drain();
  }

  private reset() {
    this.state = 'idle';
    this.buffer = Buffer.alloc(0);
    this.text = '';
    this.expectedFrame = 1;
  }

  private drain(): void {
    while (this.buffer.length) {
      const b = this.buffer[0];
      if (b === ENQ) {
        this.buffer = this.buffer.subarray(1);
        this.state = 'receiving';
        this.text = '';
        this.expectedFrame = 1;
        this.events.reply(ACK);
        continue;
      }
      if (b === EOT) {
        this.buffer = this.buffer.subarray(1);
        if (this.state === 'receiving' && this.text) this.events.message(this.text);
        this.state = 'idle';
        this.text = '';
        continue;
      }
      if (b === STX) {
        const lf = this.buffer.indexOf(LF);
        if (lf < 0) return; // wait for the rest of the frame
        const frame = this.buffer.subarray(0, lf + 1);
        this.buffer = this.buffer.subarray(lf + 1);
        this.handleFrame(frame);
        continue;
      }
      // Noise between frames
      this.buffer = this.buffer.subarray(1);
    }
  }

  private handleFrame(frame: Buffer): void {
    // STX FN ...text... ETX|ETB C1 C2 CR LF
    const endIdx = Math.max(frame.lastIndexOf(ETX), frame.lastIndexOf(ETB));
    if (endIdx < 2 || frame.length < endIdx + 5) {
      this.events.error('Malformed frame');
      this.events.reply(NAK);
      return;
    }
    const body = frame.subarray(1, endIdx + 1);
    const checksum = frame.subarray(endIdx + 1, endIdx + 3).toString('latin1').toUpperCase();
    if (astmChecksum(body) !== checksum) {
      this.events.error(`Checksum mismatch (got ${checksum}, expected ${astmChecksum(body)})`);
      this.events.reply(NAK);
      return;
    }
    const fn = Number(String.fromCharCode(body[0]));
    if (fn !== this.expectedFrame % 8) {
      // Retransmission of the previous frame: ACK but don't append twice.
      if (fn === (this.expectedFrame + 7) % 8) {
        this.events.reply(ACK);
        return;
      }
      this.events.error(`Unexpected frame number ${fn}`);
      this.events.reply(NAK);
      return;
    }
    this.expectedFrame++;
    this.text += body.subarray(1, body.length - 1).toString('latin1');
    this.events.reply(ACK);
  }
}
