import { Pool, type PoolClient } from 'pg';
import { env } from './env';
import { SCHEMA_SQL } from './db/schema';

interface PgCache {
  pool: Pool | null;
  ready: Promise<void> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __pgCache: PgCache | undefined;
}

const cache: PgCache = global.__pgCache ?? { pool: null, ready: null };
global.__pgCache = cache;

function createPool(): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
}

async function ensureSchema(client: PoolClient): Promise<void> {
  await client.query(SCHEMA_SQL);
}

async function prepare(): Promise<Pool> {
  if (!cache.pool) {
    cache.pool = createPool();
  }
  if (!cache.ready) {
    cache.ready = (async () => {
      const client = await cache.pool!.connect();
      try {
        await ensureSchema(client);
      } finally {
        client.release();
      }
      // Start the daily cleanup loop once after schema is ready.
      // Imported lazily to avoid a circular dependency (cleanup -> db).
      try {
        const { scheduleDailyCleanup } = await import('@/lib/cleanup');
        scheduleDailyCleanup();
      } catch (err) {
        console.error('[db] failed to schedule cleanup', err);
      }
    })().catch((err) => {
      cache.ready = null;
      throw err;
    });
  }
  await cache.ready;
  return cache.pool;
}

/** Connect pool and ensure tables exist. */
export async function connectDB(): Promise<Pool> {
  return prepare();
}

export async function getPool(): Promise<Pool> {
  return prepare();
}

export async function pingDatabase(): Promise<{ database: string | null }> {
  const pool = await connectDB();
  const r = await pool.query<{ db: string }>('SELECT current_database() AS db');
  return { database: r.rows[0]?.db ?? null };
}
