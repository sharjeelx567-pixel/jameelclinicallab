import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    DATA_BACKEND: z.enum(['firestore', 'memory']).default('firestore'),
    AUTH_MODE: z.enum(['firebase', 'dev']).default('firebase'),
    SEED_DEMO_DATA: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_STORAGE_BUCKET: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    FIREBASE_PRIVATE_KEY: z.string().optional(),
    BRIDGE_TOKEN_HASHES: z.string().default(''),
    REPORT_VERIFY_BASE_URL: z.string().default('http://localhost:3000/verify'),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
    LAB_TIMEZONE: z.string().default('Asia/Karachi'),
    // Cloudinary — non-sensitive images only. The API secret never leaves the server.
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    /** Optional folder prefix so several environments can share one account, e.g. "jcl-dev". */
    CLOUDINARY_FOLDER_PREFIX: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.DATA_BACKEND !== 'firestore')
        ctx.addIssue({ code: 'custom', message: 'DATA_BACKEND=memory is not allowed in production' });
      if (env.AUTH_MODE !== 'firebase')
        ctx.addIssue({ code: 'custom', message: 'AUTH_MODE=dev is not allowed in production' });
      if (env.SEED_DEMO_DATA)
        ctx.addIssue({ code: 'custom', message: 'SEED_DEMO_DATA is not allowed in production' });
    }
  });

export type AppEnv = z.infer<typeof EnvSchema>;

let cached: AppEnv | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${details}`);
  }
  return parsed.data;
}

export function getEnv(): AppEnv {
  cached ??= loadEnv();
  return cached;
}

/** Test helper: override the cached environment. */
export function setEnvForTesting(env: Partial<AppEnv>): void {
  cached = { ...loadEnv({ NODE_ENV: 'test' }), ...env };
}

/** Parses "bridgeId:sha256hex,bridgeId2:sha256hex". */
export function parseBridgeTokenHashes(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const [bridgeId, hash] = pair.split(':');
    if (bridgeId && hash && /^[a-f0-9]{64}$/i.test(hash)) map.set(bridgeId, hash.toLowerCase());
  }
  return map;
}
