import { getPool } from '@/lib/db';

export interface IMetric {
  agentId: string;
  ts: Date;
  cpuPercent: number;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  memUsedBytes: number;
  memTotalBytes: number;
  swapUsedBytes: number;
  swapTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  netRxBytes: number;
  netTxBytes: number;
  netRxBps: number;
  netTxBps: number;
  uptimeSeconds: number;
  processCount: number;
}

type MetricRow = {
  agent_id: string;
  ts: Date;
  cpu_percent: number;
  load_avg1: number;
  load_avg5: number;
  load_avg15: number;
  mem_used_bytes: string;
  mem_total_bytes: string;
  swap_used_bytes: string;
  swap_total_bytes: string;
  disk_used_bytes: string;
  disk_total_bytes: string;
  net_rx_bytes: string;
  net_tx_bytes: string;
  net_rx_bps: number;
  net_tx_bps: number;
  uptime_seconds: string;
  process_count: number;
};

function rowToMetric(row: MetricRow): IMetric {
  return {
    agentId: row.agent_id,
    ts: row.ts,
    cpuPercent: row.cpu_percent,
    loadAvg1: row.load_avg1,
    loadAvg5: row.load_avg5,
    loadAvg15: row.load_avg15,
    memUsedBytes: Number(row.mem_used_bytes),
    memTotalBytes: Number(row.mem_total_bytes),
    swapUsedBytes: Number(row.swap_used_bytes),
    swapTotalBytes: Number(row.swap_total_bytes),
    diskUsedBytes: Number(row.disk_used_bytes),
    diskTotalBytes: Number(row.disk_total_bytes),
    netRxBytes: Number(row.net_rx_bytes),
    netTxBytes: Number(row.net_tx_bytes),
    netRxBps: row.net_rx_bps,
    netTxBps: row.net_tx_bps,
    uptimeSeconds: Number(row.uptime_seconds),
    processCount: row.process_count,
  };
}

export const Metric = {
  async create(data: IMetric): Promise<IMetric> {
    const pool = await getPool();
    const r = await pool.query<MetricRow>(
      `INSERT INTO metrics (
        agent_id, ts, cpu_percent, load_avg1, load_avg5, load_avg15,
        mem_used_bytes, mem_total_bytes, swap_used_bytes, swap_total_bytes,
        disk_used_bytes, disk_total_bytes, net_rx_bytes, net_tx_bytes,
        net_rx_bps, net_tx_bps, uptime_seconds, process_count
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      ) RETURNING *`,
      [
        data.agentId,
        data.ts,
        data.cpuPercent,
        data.loadAvg1,
        data.loadAvg5,
        data.loadAvg15,
        data.memUsedBytes,
        data.memTotalBytes,
        data.swapUsedBytes,
        data.swapTotalBytes,
        data.diskUsedBytes,
        data.diskTotalBytes,
        data.netRxBytes,
        data.netTxBytes,
        data.netRxBps,
        data.netTxBps,
        data.uptimeSeconds,
        data.processCount,
      ]
    );
    return rowToMetric(r.rows[0]);
  },

  async aggregate(pipeline: unknown[]): Promise<Array<{ _id: string; metric: IMetric }>> {
    void pipeline;
    const pool = await getPool();
    const matchStage = pipeline.find(
      (s): s is { $match: { agentId: { $in: string[] } } } =>
        typeof s === 'object' && s !== null && '$match' in s
    );
    const ids = matchStage?.$match?.agentId?.$in ?? [];
    if (ids.length === 0) return [];

    const r = await pool.query<MetricRow>(
      `SELECT DISTINCT ON (agent_id) *
       FROM metrics
       WHERE agent_id = ANY($1::varchar[])
       ORDER BY agent_id, ts DESC`,
      [ids]
    );

    return r.rows.map((row) => ({
      _id: row.agent_id,
      metric: rowToMetric(row),
    }));
  },

  findOne(filter: { agentId: string }): { sort: (spec: { ts: -1 }) => { lean: () => Promise<IMetric | null> } } {
    return {
      sort() {
        return {
          async lean(): Promise<IMetric | null> {
            const pool = await getPool();
            const r = await pool.query<MetricRow>(
              `SELECT * FROM metrics WHERE agent_id = $1 ORDER BY ts DESC LIMIT 1`,
              [filter.agentId]
            );
            const row = r.rows[0];
            return row ? rowToMetric(row) : null;
          },
        };
      },
    };
  },

  find(filter: { agentId: string; ts: { $gte: Date } }): {
    sort: (spec: { ts: 1 }) => { limit: (n: number) => { lean: () => Promise<IMetric[]> } };
  } {
    return {
      sort() {
        return {
          limit(n: number) {
            return {
              async lean(): Promise<IMetric[]> {
                const pool = await getPool();
                const r = await pool.query<MetricRow>(
                  `SELECT * FROM metrics
                   WHERE agent_id = $1 AND ts >= $2
                   ORDER BY ts ASC
                   LIMIT $3`,
                  [filter.agentId, filter.ts.$gte, n]
                );
                return r.rows.map(rowToMetric);
              },
            };
          },
        };
      },
    };
  },

  async deleteMany(filter: { agentId: string }): Promise<void> {
    const pool = await getPool();
    await pool.query('DELETE FROM metrics WHERE agent_id = $1', [filter.agentId]);
  },
};
