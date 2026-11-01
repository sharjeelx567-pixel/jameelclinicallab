/**
 * Minimal structured logger. Raw analyzer payloads and patient identifiers are
 * NEVER logged — only lengths, hashes and analyzer/link state.
 */
type Level = 'info' | 'warn' | 'error';

function write(level: Level, msg: string) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg });
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  info: (m: string) => write('info', m),
  warn: (m: string) => write('warn', m),
  error: (m: string) => write('error', m),
};
