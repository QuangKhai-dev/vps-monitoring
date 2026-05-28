import { getPool } from '@/lib/db';

export interface ContainerPort {
  host?: number | null;
  container?: number | null;
  protocol?: string | null;
  ip?: string | null;
}

export interface IContainer {
  agentId: string;
  containerId: string;
  name: string;
  image: string;
  imageId: string;
  status: string;
  state: string;
  health: string;
  createdAtDocker?: Date;
  startedAtDocker?: Date;
  ports: ContainerPort[];
  cpuPercent: number;
  memUsedBytes: number;
  memLimitBytes: number;
  netRxBytes: number;
  netTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  lastSeenAt: Date;
  updatedAt: Date;
}

type ContainerRow = {
  agent_id: string;
  container_id: string;
  name: string;
  image: string;
  image_id: string;
  status: string;
  state: string;
  health: string;
  created_at_docker: Date | null;
  started_at_docker: Date | null;
  ports: ContainerPort[] | null;
  cpu_percent: number;
  mem_used_bytes: string;
  mem_limit_bytes: string;
  net_rx_bytes: string;
  net_tx_bytes: string;
  block_read_bytes: string;
  block_write_bytes: string;
  last_seen_at: Date;
  updated_at: Date;
};

function rowToContainer(row: ContainerRow): IContainer {
  return {
    agentId: row.agent_id,
    containerId: row.container_id,
    name: row.name,
    image: row.image,
    imageId: row.image_id,
    status: row.status,
    state: row.state,
    health: row.health,
    createdAtDocker: row.created_at_docker ?? undefined,
    startedAtDocker: row.started_at_docker ?? undefined,
    ports: Array.isArray(row.ports) ? row.ports : [],
    cpuPercent: row.cpu_percent,
    memUsedBytes: Number(row.mem_used_bytes),
    memLimitBytes: Number(row.mem_limit_bytes),
    netRxBytes: Number(row.net_rx_bytes),
    netTxBytes: Number(row.net_tx_bytes),
    blockReadBytes: Number(row.block_read_bytes),
    blockWriteBytes: Number(row.block_write_bytes),
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  };
}

export type ContainerUpsert = {
  agentId: string;
  containerId: string;
  name?: string;
  image?: string;
  imageId?: string;
  status?: string;
  state?: string;
  health?: string;
  createdAtDocker?: Date | null;
  startedAtDocker?: Date | null;
  ports?: ContainerPort[];
  cpuPercent?: number;
  memUsedBytes?: number;
  memLimitBytes?: number;
  netRxBytes?: number;
  netTxBytes?: number;
  blockReadBytes?: number;
  blockWriteBytes?: number;
  lastSeenAt?: Date;
};

export const Container = {
  async upsert(data: ContainerUpsert): Promise<void> {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO containers (
        agent_id, container_id, name, image, image_id, status, state, health,
        created_at_docker, started_at_docker, ports,
        cpu_percent, mem_used_bytes, mem_limit_bytes,
        net_rx_bytes, net_tx_bytes, block_read_bytes, block_write_bytes,
        last_seen_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19, NOW()
      )
      ON CONFLICT (agent_id, container_id) DO UPDATE SET
        name = EXCLUDED.name,
        image = EXCLUDED.image,
        image_id = EXCLUDED.image_id,
        status = EXCLUDED.status,
        state = EXCLUDED.state,
        health = EXCLUDED.health,
        created_at_docker = EXCLUDED.created_at_docker,
        started_at_docker = EXCLUDED.started_at_docker,
        ports = EXCLUDED.ports,
        cpu_percent = EXCLUDED.cpu_percent,
        mem_used_bytes = EXCLUDED.mem_used_bytes,
        mem_limit_bytes = EXCLUDED.mem_limit_bytes,
        net_rx_bytes = EXCLUDED.net_rx_bytes,
        net_tx_bytes = EXCLUDED.net_tx_bytes,
        block_read_bytes = EXCLUDED.block_read_bytes,
        block_write_bytes = EXCLUDED.block_write_bytes,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = NOW()`,
      [
        data.agentId,
        data.containerId,
        data.name ?? '',
        data.image ?? '',
        data.imageId ?? '',
        data.status ?? 'unknown',
        data.state ?? '',
        data.health ?? '',
        data.createdAtDocker ?? null,
        data.startedAtDocker ?? null,
        JSON.stringify(data.ports ?? []),
        data.cpuPercent ?? 0,
        data.memUsedBytes ?? 0,
        data.memLimitBytes ?? 0,
        data.netRxBytes ?? 0,
        data.netTxBytes ?? 0,
        data.blockReadBytes ?? 0,
        data.blockWriteBytes ?? 0,
        data.lastSeenAt ?? new Date(),
      ]
    );
  },

  /** Mark containers belonging to agent as removed when they didn't appear in current snapshot. */
  async markRemoved(agentId: string, presentIds: string[], staleThreshold: Date): Promise<void> {
    const pool = await getPool();
    if (presentIds.length === 0) {
      await pool.query(
        `UPDATE containers SET status = 'removed', updated_at = NOW()
         WHERE agent_id = $1 AND status <> 'removed' AND last_seen_at < $2`,
        [agentId, staleThreshold]
      );
      return;
    }
    await pool.query(
      `UPDATE containers SET status = 'removed', updated_at = NOW()
       WHERE agent_id = $1
         AND status <> 'removed'
         AND container_id <> ALL ($2::varchar[])
         AND last_seen_at < $3`,
      [agentId, presentIds, staleThreshold]
    );
  },

  async findByAgent(agentId: string, opts: { includeRemoved?: boolean } = {}): Promise<IContainer[]> {
    const pool = await getPool();
    const sql = opts.includeRemoved
      ? `SELECT * FROM containers WHERE agent_id = $1 ORDER BY name ASC, container_id ASC`
      : `SELECT * FROM containers WHERE agent_id = $1 AND status <> 'removed' ORDER BY name ASC, container_id ASC`;
    const r = await pool.query<ContainerRow>(sql, [agentId]);
    return r.rows.map(rowToContainer);
  },

  async findOne(agentId: string, containerId: string): Promise<IContainer | null> {
    const pool = await getPool();
    const r = await pool.query<ContainerRow>(
      `SELECT * FROM containers WHERE agent_id = $1 AND container_id = $2 LIMIT 1`,
      [agentId, containerId]
    );
    const row = r.rows[0];
    return row ? rowToContainer(row) : null;
  },

  async countByAgent(agentId: string): Promise<{ running: number; total: number }> {
    const pool = await getPool();
    const r = await pool.query<{ total: string; running: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status <> 'removed') AS total,
         COUNT(*) FILTER (WHERE status = 'running' OR state = 'running') AS running
       FROM containers WHERE agent_id = $1`,
      [agentId]
    );
    const row = r.rows[0];
    return {
      total: Number(row?.total ?? 0),
      running: Number(row?.running ?? 0),
    };
  },
};

export interface IContainerMetric {
  agentId: string;
  containerId: string;
  ts: Date;
  cpuPercent: number;
  memUsedBytes: number;
  memLimitBytes: number;
  netRxBytes: number;
  netTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
}

type ContainerMetricRow = {
  agent_id: string;
  container_id: string;
  ts: Date;
  cpu_percent: number;
  mem_used_bytes: string;
  mem_limit_bytes: string;
  net_rx_bytes: string;
  net_tx_bytes: string;
  block_read_bytes: string;
  block_write_bytes: string;
};

function rowToContainerMetric(row: ContainerMetricRow): IContainerMetric {
  return {
    agentId: row.agent_id,
    containerId: row.container_id,
    ts: row.ts,
    cpuPercent: row.cpu_percent,
    memUsedBytes: Number(row.mem_used_bytes),
    memLimitBytes: Number(row.mem_limit_bytes),
    netRxBytes: Number(row.net_rx_bytes),
    netTxBytes: Number(row.net_tx_bytes),
    blockReadBytes: Number(row.block_read_bytes),
    blockWriteBytes: Number(row.block_write_bytes),
  };
}

export const ContainerMetric = {
  async create(data: IContainerMetric): Promise<void> {
    const pool = await getPool();
    await pool.query(
      `INSERT INTO container_metrics (
        agent_id, container_id, ts, cpu_percent,
        mem_used_bytes, mem_limit_bytes,
        net_rx_bytes, net_tx_bytes, block_read_bytes, block_write_bytes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        data.agentId,
        data.containerId,
        data.ts,
        data.cpuPercent,
        data.memUsedBytes,
        data.memLimitBytes,
        data.netRxBytes,
        data.netTxBytes,
        data.blockReadBytes,
        data.blockWriteBytes,
      ]
    );
  },

  async findRange(
    agentId: string,
    containerId: string,
    from: Date,
    limit = 2000
  ): Promise<IContainerMetric[]> {
    const pool = await getPool();
    const r = await pool.query<ContainerMetricRow>(
      `SELECT * FROM container_metrics
       WHERE agent_id = $1 AND container_id = $2 AND ts >= $3
       ORDER BY ts ASC
       LIMIT $4`,
      [agentId, containerId, from, limit]
    );
    return r.rows.map(rowToContainerMetric);
  },
};
