/**
 * Centralised, typed REST client for the NestJS backend. All business rules
 * (prices, permissions, status changes) are enforced server-side; this client
 * only transports requests and normalises errors.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** Field-level validation messages keyed by path, if the server returned them. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(
      (this.details as Array<{ path?: string; message?: string }>).filter((d) => d.path && d.message).map((d) => [d.path!, d.message!]),
    );
  }
}

type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider = async () => null;
let onUnauthenticated: (code: string) => void = () => undefined;

export function configureApiClient(opts: { getToken: TokenProvider; onUnauthenticated: (code: string) => void }) {
  tokenProvider = opts.getToken;
  onUnauthenticated = opts.onUnauthenticated;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${API_URL}${path}`);
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  return url.toString();
}

async function request<T>(method: string, path: string, options: { body?: unknown; query?: Query; raw?: boolean; form?: FormData; idempotencyKey?: string } = {}): Promise<T> {
  const token = await tokenProvider();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  // Lets the server recognise a retried submission and return the original result instead of saving twice.
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the laboratory server. Check your connection and try again.');
  }

  if (options.raw && res.ok) return (await res.blob()) as T;
  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } | null;
  if (!res.ok || !json?.success) {
    const err = json?.error ?? { code: 'HTTP_ERROR', message: `Request failed (${res.status})` };
    if (res.status === 401) onUnauthenticated(err.code);
    throw new ApiError(res.status, err.code, err.message, err.details);
  }
  return json.data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown, opts: { idempotencyKey?: string } = {}) => request<T>('POST', path, { body: body ?? {}, ...opts }),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, { body }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<T>('POST', path, { form });
  },
  blob: (path: string) => request<Blob>('GET', path, { raw: true }),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
  uploadWithProgress,
};

/**
 * Multipart upload with progress (fetch cannot report upload progress, so this
 * uses XMLHttpRequest). Same auth and error handling as `request`.
 */
async function uploadWithProgress<T>(
  method: 'POST' | 'PUT',
  path: string,
  file: File,
  opts: { fields?: Record<string, string | undefined>; onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<T> {
  const token = await tokenProvider();
  const form = new FormData();
  Object.entries(opts.fields ?? {}).forEach(([k, v]) => v !== undefined && v !== '' && form.append(k, v));
  form.append('file', file);

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, buildUrl(path));
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the laboratory server. Check your connection and try again.'));
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Upload cancelled'));
    xhr.onload = () => {
      let json: { success?: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON response */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json?.success) return resolve(json.data as T);
      const err = json?.error ?? { code: 'HTTP_ERROR', message: xhr.status === 413 ? 'The file is too large' : `Upload failed (${xhr.status})` };
      if (xhr.status === 401) onUnauthenticated(err.code);
      reject(new ApiError(xhr.status, err.code, err.message, err.details));
    };
    opts.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

/** Readable message; for validation errors it names the first problem field, e.g. "Row 14 (rows.12.sample): …". */
export const errorMessage = (err: unknown) => {
  if (err instanceof ApiError) {
    const first = Object.entries(err.fieldErrors)[0];
    if (!first) return err.message;
    const [path, msg] = first;
    const row = /^rows.(d+)(?:.(w+))?/.exec(path);
    const where = row ? `Row ${Number(row[1]) + 2} of the file${row[2] ? ` (${row[2]})` : ''}` : path;
    const more = Object.keys(err.fieldErrors).length - 1;
    return `${err.message}: ${where} — ${msg}${more > 0 ? ` (and ${more} more)` : ''}`;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
};
