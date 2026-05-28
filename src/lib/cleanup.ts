import { getPool } from '@/lib/db';
import { getAppSettings } from '@/lib/app-settings';

/**
 * Lightweight daily cleanup: removes expired container metrics, old removed-container rows,
 * and completed agent commands. Uses retention from app_settings.
 *
 * Avoids node-cron as a dependency; runs first at next 03:00 local time, then every 24h.
 * A module-level flag guards against multiple schedules in the same Node.js process (hot reload).
 */

interface CleanupCache {
  scheduled: boolean;
  timer: NodeJS.Timeout | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __vpsMonCleanup: CleanupCache | undefined;
}

const cache: CleanupCache = global.__vpsMonCleanup ?? { scheduled: false, timer: null };
global.__vpsMonCleanup = cache;

const COMMAND_RETENTION_DAYS = 7;
const REMOVED_CONTAINER_RETENTION_DAYS = 1;

export async function runCleanupNow(): Promise<{
  containerMetricsDeleted: number;
  containersDeleted: number;
  commandsDeleted: number;
}> {
  const settings = await getAppSettings().catch(() => null);
  const retention = Math.max(1, Math.min(90, settings?.containerMetricsRetentionDays ?? 7));
  const pool = await getPool();

  const r1 = await pool.query(
    `DELETE FROM container_metrics WHERE ts < NOW() - ($1 || ' days')::interval`,
    [String(retention)]
  );
  const r2 = await pool.query(
    `DELETE FROM containers
     WHERE status = 'removed'
       AND last_seen_at < NOW() - ($1 || ' days')::interval`,
    [String(REMOVED_CONTAINER_RETENTION_DAYS)]
  );
  const r3 = await pool.query(
    `DELETE FROM agent_commands
     WHERE status IN ('success', 'failed')
       AND created_at < NOW() - ($1 || ' days')::interval`,
    [String(COMMAND_RETENTION_DAYS)]
  );

  return {
    containerMetricsDeleted: r1.rowCount ?? 0,
    containersDeleted: r2.rowCount ?? 0,
    commandsDeleted: r3.rowCount ?? 0,
  };
}

function msUntilNext03(): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(3, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function scheduleNext(): void {
  if (cache.timer) clearTimeout(cache.timer);
  cache.timer = setTimeout(async () => {
    try {
      const result = await runCleanupNow();
      console.info('[cleanup] daily run', result);
    } catch (err) {
      console.error('[cleanup] failed', err);
    } finally {
      scheduleNext();
    }
  }, msUntilNext03());
  if (typeof cache.timer.unref === 'function') cache.timer.unref();
}

export function scheduleDailyCleanup(): void {
  if (cache.scheduled) return;
  cache.scheduled = true;
  scheduleNext();
  console.info(`[cleanup] scheduled — first run in ${Math.round(msUntilNext03() / 60_000)} min`);
}
