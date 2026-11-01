import type { ParsedMessage } from './types';

/**
 * ASTM E1394 (CLSI LIS2-A2) record parser.
 * Records are CR-separated: H (header), P (patient), O (order), R (result), C, Q, L.
 * Delimiters are declared in the header: H|\^&  → field |, repeat \, component ^, escape &.
 *
 * Field positions follow the standard; vendors frequently deviate. Confirm against
 * the specific analyzer's host interface specification before going live.
 */
export function parseAstm(raw: string): ParsedMessage {
  const errors: string[] = [];
  const records = raw.split(/\r\n|\r|\n/).map((r) => r.trim()).filter(Boolean)
    // Strip a leading frame number if records were captured with it (e.g. "1H|...")
    .map((r) => (/^[0-7][HPOCRLQM]\|/.test(r) ? r.slice(1) : r));

  const header = records.find((r) => r.startsWith('H'));
  if (!header) return { results: [], errors: ['Missing header (H) record'] };
  const field = header[1] ?? '|';
  const repeat = header[2] ?? '\\';
  const component = header[3] ?? '^';

  if (!records.some((r) => r.startsWith('L'))) errors.push('Missing terminator (L) record');

  let sampleIdentifier: string | undefined;
  const results: ParsedMessage['results'] = [];
  for (const rec of records) {
    const f = rec.split(field);
    switch (f[0]) {
      case 'O': {
        // O-3 Specimen ID (as sent by the LIS / barcode). Some analyzers use O-4 (instrument specimen ID).
        const id = (f[2] || f[3] || '').split(component)[0].trim();
        if (id) sampleIdentifier ??= id;
        else errors.push('Order record without specimen identifier');
        break;
      }
      case 'R': {
        // R-3 Universal Test ID (^^^code^...), R-4 value, R-5 units, R-7 abnormal flags
        const testId = (f[2] ?? '').split(repeat)[0].split(component);
        const code = (testId[3] || testId.find((c) => c.trim()) || '').trim();
        const value = (f[3] ?? '').split(component)[0].trim();
        if (!code) {
          errors.push(`Result record without test code: ${rec.slice(0, 60)}`);
          break;
        }
        if (value === '') {
          errors.push(`Result ${code} has no value`);
          break;
        }
        results.push({ analyzerTestCode: code, value, unit: f[4]?.trim() || undefined, flags: f[6]?.trim() || undefined });
        break;
      }
      default:
        break;
    }
  }
  if (!sampleIdentifier) errors.push('No specimen identifier found');
  if (!results.length) errors.push('No result records found');
  return { sampleIdentifier, results, errors };
}
