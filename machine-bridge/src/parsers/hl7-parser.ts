import type { ParsedMessage } from './types';

/** MLLP framing: <VT> message <FS><CR> */
export const VT = 0x0b;
export const FS = 0x1c;

/**
 * HL7 v2.x ORU^R01 result parser (OBR/OBX). Sample identifier is taken from
 * SPM-2, else OBR-3 (filler order number), else OBR-2 (placer order number).
 */
export function parseHl7(raw: string): ParsedMessage {
  const errors: string[] = [];
  const segments = raw.split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean);
  const msh = segments.find((s) => s.startsWith('MSH'));
  if (!msh) return { results: [], errors: ['Missing MSH segment'] };
  const field = msh[3];
  const component = msh[4] ?? '^';
  const messageType = msh.split(field)[8] ?? '';
  if (!messageType.startsWith(`ORU${component}R01`) && !messageType.startsWith('ORU')) errors.push(`Unexpected message type ${messageType || '(none)'}`);

  let sampleIdentifier: string | undefined;
  const results: ParsedMessage['results'] = [];
  for (const seg of segments) {
    const f = seg.split(field);
    if (f[0] === 'SPM') sampleIdentifier = (f[2] ?? '').split(component)[0] || sampleIdentifier;
    if (f[0] === 'OBR' && !sampleIdentifier) sampleIdentifier = (f[3] || f[2] || '').split(component)[0] || undefined;
    if (f[0] === 'OBX') {
      const code = (f[3] ?? '').split(component)[0].trim();
      const value = (f[5] ?? '').trim();
      if (!code) errors.push('OBX without observation identifier');
      else if (value === '') errors.push(`OBX ${code} has no value`);
      else results.push({ analyzerTestCode: code, value, unit: (f[6] ?? '').split(component)[0] || undefined, flags: f[8] || undefined });
    }
  }
  if (!sampleIdentifier) errors.push('No specimen identifier found');
  if (!results.length) errors.push('No OBX result segments found');
  return { sampleIdentifier: sampleIdentifier?.trim(), results, errors };
}

/** Builds an HL7 ACK (AA = accepted) for the received message's control id. */
export function buildHl7Ack(raw: string, code: 'AA' | 'AE' = 'AA'): string {
  const msh = raw.split(/\r|\n/).find((s) => s.startsWith('MSH')) ?? 'MSH|^~\\&';
  const field = msh[3] ?? '|';
  const f = msh.split(field);
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return [`MSH${field}${f[1] ?? '^~\\&'}${field}JCL-LIS${field}JCL${field}${f[2] ?? ''}${field}${f[3] ?? ''}${field}${ts}${field}${field}ACK${field}${Date.now()}${field}P${field}${f[11] ?? '2.5'}`, `MSA${field}${code}${field}${f[9] ?? ''}`].join('\r');
}

export function unwrapMllp(buffer: Buffer): { messages: string[]; rest: Buffer } {
  const messages: string[] = [];
  let rest = buffer;
  for (;;) {
    const start = rest.indexOf(VT);
    const end = rest.indexOf(FS, start + 1);
    if (start < 0 || end < 0) break;
    messages.push(rest.subarray(start + 1, end).toString('utf8'));
    rest = rest.subarray(end + 1);
    if (rest[0] === 0x0d) rest = rest.subarray(1);
  }
  return { messages, rest };
}

export const wrapMllp = (msg: string) => Buffer.concat([Buffer.from([VT]), Buffer.from(msg, 'utf8'), Buffer.from([FS, 0x0d])]);
