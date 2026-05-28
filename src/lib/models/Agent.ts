import { getPool } from '@/lib/db';

export interface IAgent {
  agentId: string;
  token: string;
  hostname: string;
  os: string;
  osVersion: string;
  kernel: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  totalDiskBytes: number;
  publicIp?: string;
  privateIp?: string;
  tags: string[];
  label?: string;
  lastSeenAt?: Date;
  lastTelegramAlertAt?: Date;
  registeredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentDocument = IAgent & {
  save: () => Promise<void>;
};

type AgentRow = {
  agent_id: string;
  token: string;
  hostname: string;
  os: string;
  os_version: string;
  kernel: string;
  arch: string;
  cpu_model: string;
  cpu_cores: number;
  total_memory_bytes: string;
  total_disk_bytes: string;
  public_ip: string | null;
  private_ip: string | null;
  tags: string[];
  label: string | null;
  last_seen_at: Date | null;
  last_telegram_alert_at: Date | null;
  registered_at: Date;
  created_at: Date;
  updated_at: Date;
};

export function rowToAgent(row: AgentRow): IAgent {
  return {
    agentId: row.agent_id,
    token: row.token,
    hostname: row.hostname,
    os: row.os,
    osVersion: row.os_version,
    kernel: row.kernel,
    arch: row.arch,
    cpuModel: row.cpu_model,
    cpuCores: row.cpu_cores,
    totalMemoryBytes: Number(row.total_memory_bytes),
    totalDiskBytes: Number(row.total_disk_bytes),
    publicIp: row.public_ip ?? undefined,
    privateIp: row.private_ip ?? undefined,
    tags: row.tags ?? [],
    label: row.label ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    lastTelegramAlertAt: row.last_telegram_alert_at ?? undefined,
    registeredAt: row.registered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asDocument(agent: IAgent): AgentDocument {
  return {
    ...agent,
    async save() {
      const pool = await getPool();
      await pool.query(
        `UPDATE agents SET
          hostname = $2, os = $3, os_version = $4, kernel = $5, arch = $6,
          cpu_model = $7, cpu_cores = $8, total_memory_bytes = $9, total_disk_bytes = $10,
          public_ip = $11, private_ip = $12, tags = $13, label = $14,
          last_seen_at = $15, last_telegram_alert_at = $16, updated_at = NOW()
        WHERE agent_id = $1`,
        [
          agent.agentId,
          agent.hostname,
          agent.os,
          agent.osVersion,
          agent.kernel,
          agent.arch,
          agent.cpuModel,
          agent.cpuCores,
          agent.totalMemoryBytes,
          agent.totalDiskBytes,
          agent.publicIp ?? null,
          agent.privateIp ?? null,
          agent.tags,
          agent.label ?? null,
          agent.lastSeenAt ?? null,
          agent.lastTelegramAlertAt ?? null,
        ]
      );
    },
  };
}

export const Agent = {
  find(filter: Record<string, never> = {}): { sort: (spec: Record<string, 1>) => { lean: () => Promise<IAgent[]> } } {
    void filter;
    return {
      sort() {
        return {
          async lean(): Promise<IAgent[]> {
            const pool = await getPool();
            const r = await pool.query<AgentRow>(
              'SELECT * FROM agents ORDER BY hostname ASC, agent_id ASC'
            );
            return r.rows.map(rowToAgent);
          },
        };
      },
    };
  },

  async findOne(filter: { agentId?: string; token?: string }): Promise<AgentDocument | null> {
    const pool = await getPool();
    let sql = 'SELECT * FROM agents WHERE ';
    const params: string[] = [];

    if (filter.agentId && filter.token) {
      sql += 'agent_id = $1 AND token = $2';
      params.push(filter.agentId, filter.token);
    } else if (filter.agentId) {
      sql += 'agent_id = $1';
      params.push(filter.agentId);
    } else {
      return null;
    }

    sql += ' LIMIT 1';
    const r = await pool.query<AgentRow>(sql, params);
    const row = r.rows[0];
    return row ? asDocument(rowToAgent(row)) : null;
  },

  async findOneAndUpdate(
    filter: { agentId: string },
    update: { $set: { label?: string; tags?: string[] } },
    _opts?: { new?: boolean }
  ): Promise<AgentDocument | null> {
    void _opts;
    const pool = await getPool();
    const sets: string[] = [];
    const params: unknown[] = [filter.agentId];
    let i = 2;

    if (update.$set.label !== undefined) {
      sets.push(`label = $${i++}`);
      params.push(update.$set.label);
    }
    if (update.$set.tags !== undefined) {
      sets.push(`tags = $${i++}`);
      params.push(update.$set.tags);
    }
    if (sets.length === 0) {
      return this.findOne({ agentId: filter.agentId });
    }
    sets.push('updated_at = NOW()');

    const r = await pool.query<AgentRow>(
      `UPDATE agents SET ${sets.join(', ')} WHERE agent_id = $1 RETURNING *`,
      params
    );
    const row = r.rows[0];
    return row ? asDocument(rowToAgent(row)) : null;
  },

  async create(data: Partial<IAgent> & Pick<IAgent, 'agentId' | 'token'>): Promise<AgentDocument> {
    const pool = await getPool();
    const r = await pool.query<AgentRow>(
      `INSERT INTO agents (
        agent_id, token, hostname, os, os_version, kernel, arch, cpu_model, cpu_cores,
        total_memory_bytes, total_disk_bytes, public_ip, private_ip, tags, registered_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        data.agentId,
        data.token,
        data.hostname ?? 'unknown',
        data.os ?? 'unknown',
        data.osVersion ?? '',
        data.kernel ?? '',
        data.arch ?? '',
        data.cpuModel ?? '',
        data.cpuCores ?? 0,
        data.totalMemoryBytes ?? 0,
        data.totalDiskBytes ?? 0,
        data.publicIp ?? null,
        data.privateIp ?? null,
        data.tags ?? [],
        data.registeredAt ?? new Date(),
      ]
    );
    return asDocument(rowToAgent(r.rows[0]));
  },

  async deleteOne(filter: { agentId: string }): Promise<void> {
    const pool = await getPool();
    await pool.query('DELETE FROM agents WHERE agent_id = $1', [filter.agentId]);
  },
};
