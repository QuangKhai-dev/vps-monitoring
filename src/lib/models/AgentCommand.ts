import { getPool } from '@/lib/db';

export type CommandAction = 'start' | 'stop' | 'restart' | 'logs' | 'shell';
export type CommandStatus = 'pending' | 'sent' | 'success' | 'failed';

export interface IAgentCommand {
  id: string;
  agentId: string;
  containerId: string;
  action: CommandAction;
  args: Record<string, unknown>;
  status: CommandStatus;
  result: Record<string, unknown>;
  createdByUserId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  completedAt: Date | null;
}

type CommandRow = {
  id: string;
  agent_id: string;
  container_id: string;
  action: string;
  args: Record<string, unknown> | null;
  status: string;
  result: Record<string, unknown> | null;
  created_by_user_id: string | null;
  created_at: Date;
  sent_at: Date | null;
  completed_at: Date | null;
};

function rowToCommand(row: CommandRow): IAgentCommand {
  return {
    id: row.id,
    agentId: row.agent_id,
    containerId: row.container_id,
    action: row.action as CommandAction,
    args: row.args ?? {},
    status: row.status as CommandStatus,
    result: row.result ?? {},
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    sentAt: row.sent_at,
    completedAt: row.completed_at,
  };
}

export type CreateCommandInput = {
  agentId: string;
  containerId: string;
  action: CommandAction;
  args?: Record<string, unknown>;
  createdByUserId?: string | null;
};

export const AgentCommand = {
  async create(data: CreateCommandInput): Promise<IAgentCommand> {
    const pool = await getPool();
    const r = await pool.query<CommandRow>(
      `INSERT INTO agent_commands (agent_id, container_id, action, args, created_by_user_id)
       VALUES ($1,$2,$3,$4::jsonb,$5)
       RETURNING *`,
      [
        data.agentId,
        data.containerId,
        data.action,
        JSON.stringify(data.args ?? {}),
        data.createdByUserId ?? null,
      ]
    );
    return rowToCommand(r.rows[0]);
  },

  async findById(id: string): Promise<IAgentCommand | null> {
    const pool = await getPool();
    const r = await pool.query<CommandRow>(
      `SELECT * FROM agent_commands WHERE id = $1 LIMIT 1`,
      [id]
    );
    const row = r.rows[0];
    return row ? rowToCommand(row) : null;
  },

  async findRecentByAgent(
    agentId: string,
    opts: { action?: CommandAction; limit?: number } = {}
  ): Promise<IAgentCommand[]> {
    const pool = await getPool();
    const limit = Math.max(1, Math.min(100, opts.limit ?? 20));
    const params: unknown[] = [agentId];
    let where = 'agent_id = $1';
    if (opts.action) {
      params.push(opts.action);
      where += ` AND action = $${params.length}`;
    }
    params.push(limit);
    const r = await pool.query<CommandRow>(
      `SELECT * FROM agent_commands
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return r.rows.map(rowToCommand);
  },

  /** Atomically claim all pending commands for an agent and mark them as 'sent'. */
  async claimPending(agentId: string): Promise<IAgentCommand[]> {
    const pool = await getPool();
    const r = await pool.query<CommandRow>(
      `WITH claimed AS (
         SELECT id FROM agent_commands
         WHERE agent_id = $1 AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT 20
         FOR UPDATE SKIP LOCKED
       )
       UPDATE agent_commands ac
       SET status = 'sent', sent_at = NOW()
       FROM claimed
       WHERE ac.id = claimed.id
       RETURNING ac.*`,
      [agentId]
    );
    return r.rows.map(rowToCommand);
  },

  async ack(
    id: string,
    agentId: string,
    status: 'success' | 'failed',
    result: Record<string, unknown>
  ): Promise<IAgentCommand | null> {
    const pool = await getPool();
    const r = await pool.query<CommandRow>(
      `UPDATE agent_commands
       SET status = $3, result = $4::jsonb, completed_at = NOW()
       WHERE id = $1 AND agent_id = $2
       RETURNING *`,
      [id, agentId, status, JSON.stringify(result ?? {})]
    );
    const row = r.rows[0];
    return row ? rowToCommand(row) : null;
  },
};
