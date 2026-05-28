const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret-change-me-in-production-please';

function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Missing required environment variable: JWT_SECRET. Set it before starting the server.'
    );
  }
  return DEV_FALLBACK_SECRET;
}

function buildDatabaseUrl(): string {
  const direct = process.env.DATABASE_URL?.trim();
  if (direct) return direct;

  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const database =
    process.env.DB_DATABASE?.trim() ||
    process.env.DB_NAME?.trim() ||
    'vps_monitoring';
  const user = process.env.DB_USERNAME?.trim() || process.env.DB_USER?.trim() || 'admin';
  const password = process.env.DB_PASSWORD ?? '';

  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  return `postgresql://${encUser}:${encPass}@${host}:${port}/${database}`;
}

export const env = {
  get DATABASE_URL(): string {
    return buildDatabaseUrl();
  },
  get JWT_SECRET(): string {
    return resolveJwtSecret();
  },
  get APP_URL(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  },
  get AGENT_OFFLINE_AFTER_SECONDS(): number {
    return Number(process.env.AGENT_OFFLINE_AFTER_SECONDS ?? 60);
  },
};
