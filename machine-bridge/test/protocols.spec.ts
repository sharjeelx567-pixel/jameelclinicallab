import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAnalyzer } from '../src/config/config';
import { AstmDriver, DriverMessage } from '../src/drivers/drivers';
import { parseAstm } from '../src/parsers/astm-parser';
import { buildHl7Ack, parseHl7, unwrapMllp, wrapMllp } from '../src/parsers/hl7-parser';
import { ACK, AstmLowLevelReceiver, astmChecksum, buildFrame, ENQ, EOT, NAK } from '../src/protocols/astm-framing';
import { FileQueue } from '../src/queue/file-queue';

// Synthetic messages built for tests. Not captured from a BIOELAB device.
const ASTM_MSG = ['H|\\^&|||Analyzer^1|||||||P|1', 'P|1||PID1', 'O|1|S260000123||^^^GLU', 'R|1|^^^GLU|95|mg/dL||N||F', 'R|2|^^^CHOL|180|mg/dL||H||F', 'L|1|N'].join('\r');

describe('ASTM low-level framing', () => {
  it('computes the modulo-256 checksum', () => {
    expect(astmChecksum(Buffer.from('1H|\\^&\x03', 'latin1'))).toMatch(/^[0-9A-F]{2}$/);
  });

  it('ACKs ENQ and valid frames, reassembles multi-frame messages, emits on EOT', () => {
    const replies: number[] = [];
    const messages: string[] = [];
    const rx = new AstmLowLevelReceiver({ reply: (b) => replies.push(b), message: (m) => messages.push(m), error: () => undefined });
    rx.push(Buffer.from([ENQ]));
    const half = Math.floor(ASTM_MSG.length / 2);
    rx.push(buildFrame(1, ASTM_MSG.slice(0, half), false));
    const f2 = buildFrame(2, ASTM_MSG.slice(half), true);
    rx.push(f2.subarray(0, 5)); // split TCP chunk
    rx.push(f2.subarray(5));
    rx.push(Buffer.from([EOT]));
    expect(replies).toEqual([ACK, ACK, ACK]);
    expect(messages).toEqual([ASTM_MSG]);
  });

  it('NAKs a frame with a bad checksum', () => {
    const replies: number[] = [];
    const rx = new AstmLowLevelReceiver({ reply: (b) => replies.push(b), message: () => undefined, error: () => undefined });
    rx.push(Buffer.from([ENQ]));
    const frame = buildFrame(1, 'H|\\^&', true);
    frame[frame.length - 4] = 0x30; // corrupt checksum
    frame[frame.length - 3] = 0x30;
    rx.push(frame);
    expect(replies).toEqual([ACK, NAK]);
  });
});

describe('ASTM record parser', () => {
  it('extracts specimen id and results', () => {
    const p = parseAstm(ASTM_MSG);
    expect(p.errors).toEqual([]);
    expect(p.sampleIdentifier).toBe('S260000123');
    expect(p.results).toEqual([
      { analyzerTestCode: 'GLU', value: '95', unit: 'mg/dL', flags: 'N' },
      { analyzerTestCode: 'CHOL', value: '180', unit: 'mg/dL', flags: 'H' },
    ]);
  });

  it('reports structural errors instead of guessing', () => {
    expect(parseAstm('garbage').errors).toContain('Missing header (H) record');
    const p = parseAstm('H|\\^&\rR|1|^^^GLU||\rL|1');
    expect(p.errors).toEqual(expect.arrayContaining(['Result GLU has no value', 'No specimen identifier found']));
  });
});

describe('HL7 v2 parser', () => {
  const HL7 = ['MSH|^~\\&|ANALYZER|LAB|LIS|JCL|20260101120000||ORU^R01|MSG001|P|2.5', 'PID|1||PID1', 'OBR|1|ORD1|S260000999|CBC', 'OBX|1|NM|HGB^Hemoglobin||13.2|g/dL|||N|||F', 'OBX|2|NM|WBC||7.1|10*3/uL|||N|||F'].join('\r');

  it('parses OBX results and the specimen id', () => {
    const p = parseHl7(HL7);
    expect(p.errors).toEqual([]);
    expect(p.sampleIdentifier).toBe('S260000999');
    expect(p.results.map((r) => [r.analyzerTestCode, r.value, r.unit])).toEqual([
      ['HGB', '13.2', 'g/dL'],
      ['WBC', '7.1', '10*3/uL'],
    ]);
  });

  it('round-trips MLLP framing and builds an ACK with the control id', () => {
    const { messages, rest } = unwrapMllp(Buffer.concat([wrapMllp(HL7), Buffer.from([0x0b])]));
    expect(messages).toEqual([HL7]);
    expect(rest.length).toBe(1);
    expect(buildHl7Ack(HL7)).toContain('MSA|AA|MSG001');
  });
});

describe('durable queue', () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), 'jcl-q-'))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const msg = { analyzerId: 'a1', protocol: 'astm' as const, isDemo: false, raw: ASTM_MSG, results: [], parseErrors: [], receivedAt: new Date().toISOString() };

  it('deduplicates identical messages and survives restart', () => {
    const q = new FileQueue(dir);
    expect(q.enqueue(msg).duplicate).toBe(false);
    expect(q.enqueue(msg).duplicate).toBe(true);
    expect(new FileQueue(dir).depth()).toEqual({ pending: 1, failed: 0 });
  });

  it('backs off on retry and moves permanent failures aside', () => {
    const q = new FileQueue(dir);
    const { id } = q.enqueue(msg);
    const [m] = q.due();
    q.retryLater(m, 'network down');
    expect(q.due()).toHaveLength(0);
    expect(q.all()[0]).toMatchObject({ id, attempts: 1, lastError: 'network down' });
    q.moveToFailed(q.all()[0], '400 bad');
    expect(q.depth()).toEqual({ pending: 0, failed: 1 });
    expect(q.enqueue(msg).duplicate).toBe(true); // a failed message is not silently re-queued
  });
});

describe('configuration safety', () => {
  it('refuses demo connectors on live analyzers and vice versa', () => {
    expect(() => validateAnalyzer({ analyzerId: 'x', mode: 'live', protocol: 'astm', connector: { type: 'demo', intervalSeconds: 5 } }, 0)).toThrow();
    expect(() => validateAnalyzer({ analyzerId: 'x', mode: 'demo', protocol: 'astm', connector: { type: 'tcp-server', host: '0.0.0.0', port: 5000 } }, 0)).toThrow();
  });
});

describe('ASTM driver over a real TCP socket', () => {
  it('reports "listening" until a device connects, then ACKs and emits the message', async () => {
    const port = 40000 + Math.floor(Math.random() * 10000);
    const driver = new AstmDriver({ analyzerId: 'a1', name: 'test', mode: 'live', protocol: 'astm', connector: { type: 'tcp-server', host: '127.0.0.1', port } });
    await driver.start();
    const client = net.createConnection({ host: '127.0.0.1', port });
    try {
      expect(driver.status().link).toBe('listening');
      const received = new Promise<DriverMessage>((resolve) => driver.once('message', resolve));
      const replies: number[] = [];
      const twoAcks = new Promise<void>((resolve) =>
        client.on('data', (d) => {
          replies.push(...d);
          if (replies.length >= 2) resolve();
        }),
      );
      await new Promise<void>((r) => client.once('connect', () => r()));
      client.write(Buffer.from([ENQ]));
      client.write(buildFrame(1, ASTM_MSG));
      client.write(Buffer.from([EOT]));

      const m = await received;
      await twoAcks;
      expect(m.parsed.sampleIdentifier).toBe('S260000123');
      expect(m.isDemo).toBe(false);
      expect(driver.status().link).toBe('connected');
      expect(replies).toEqual([ACK, ACK]);
    } finally {
      client.destroy();
      await driver.stop();
    }
  });
});
