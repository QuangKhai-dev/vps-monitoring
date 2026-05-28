/** Idempotent schema for VPS Monitor (PostgreSQL). */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(128) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  agent_id VARCHAR(64) PRIMARY KEY,
  token VARCHAR(128) NOT NULL UNIQUE,
  hostname VARCHAR(255) NOT NULL DEFAULT 'unknown',
  os VARCHAR(64) NOT NULL DEFAULT 'unknown',
  os_version VARCHAR(128) NOT NULL DEFAULT '',
  kernel VARCHAR(128) NOT NULL DEFAULT '',
  arch VARCHAR(32) NOT NULL DEFAULT '',
  cpu_model VARCHAR(255) NOT NULL DEFAULT '',
  cpu_cores INTEGER NOT NULL DEFAULT 0,
  total_memory_bytes BIGINT NOT NULL DEFAULT 0,
  total_disk_bytes BIGINT NOT NULL DEFAULT 0,
  public_ip VARCHAR(64),
  private_ip VARCHAR(64),
  tags TEXT[] NOT NULL DEFAULT '{}',
  label VARCHAR(64),
  last_seen_at TIMESTAMPTZ,
  last_telegram_alert_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agents_token_idx ON agents (token);

CREATE TABLE IF NOT EXISTS metrics (
  id BIGSERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL REFERENCES agents (agent_id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL,
  cpu_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  load_avg1 DOUBLE PRECISION NOT NULL DEFAULT 0,
  load_avg5 DOUBLE PRECISION NOT NULL DEFAULT 0,
  load_avg15 DOUBLE PRECISION NOT NULL DEFAULT 0,
  mem_used_bytes BIGINT NOT NULL DEFAULT 0,
  mem_total_bytes BIGINT NOT NULL DEFAULT 0,
  swap_used_bytes BIGINT NOT NULL DEFAULT 0,
  swap_total_bytes BIGINT NOT NULL DEFAULT 0,
  disk_used_bytes BIGINT NOT NULL DEFAULT 0,
  disk_total_bytes BIGINT NOT NULL DEFAULT 0,
  net_rx_bytes BIGINT NOT NULL DEFAULT 0,
  net_tx_bytes BIGINT NOT NULL DEFAULT 0,
  net_rx_bps DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_tx_bps DOUBLE PRECISION NOT NULL DEFAULT 0,
  uptime_seconds BIGINT NOT NULL DEFAULT 0,
  process_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS metrics_agent_ts_idx ON metrics (agent_id, ts DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  singleton SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  telegram_bot_token TEXT NOT NULL DEFAULT '',
  telegram_chat_id TEXT NOT NULL DEFAULT '',
  alert_cpu_percent INTEGER NOT NULL DEFAULT 85,
  alert_ram_percent INTEGER NOT NULL DEFAULT 85,
  alert_disk_percent INTEGER NOT NULL DEFAULT 90,
  telegram_cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS container_metrics_retention_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS container_metrics_interval_seconds INTEGER NOT NULL DEFAULT 30;
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS container_control_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS shell_command_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS containers (
  agent_id VARCHAR(64) NOT NULL REFERENCES agents (agent_id) ON DELETE CASCADE,
  container_id VARCHAR(128) NOT NULL,
  name VARCHAR(255) NOT NULL DEFAULT '',
  image VARCHAR(512) NOT NULL DEFAULT '',
  image_id VARCHAR(128) NOT NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'unknown',
  state VARCHAR(32) NOT NULL DEFAULT '',
  health VARCHAR(32) NOT NULL DEFAULT '',
  created_at_docker TIMESTAMPTZ,
  started_at_docker TIMESTAMPTZ,
  ports JSONB NOT NULL DEFAULT '[]'::jsonb,
  cpu_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  mem_used_bytes BIGINT NOT NULL DEFAULT 0,
  mem_limit_bytes BIGINT NOT NULL DEFAULT 0,
  net_rx_bytes BIGINT NOT NULL DEFAULT 0,
  net_tx_bytes BIGINT NOT NULL DEFAULT 0,
  block_read_bytes BIGINT NOT NULL DEFAULT 0,
  block_write_bytes BIGINT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, container_id)
);

CREATE INDEX IF NOT EXISTS containers_agent_idx ON containers (agent_id);

CREATE TABLE IF NOT EXISTS container_metrics (
  id BIGSERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  container_id VARCHAR(128) NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  cpu_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
  mem_used_bytes BIGINT NOT NULL DEFAULT 0,
  mem_limit_bytes BIGINT NOT NULL DEFAULT 0,
  net_rx_bytes BIGINT NOT NULL DEFAULT 0,
  net_tx_bytes BIGINT NOT NULL DEFAULT 0,
  block_read_bytes BIGINT NOT NULL DEFAULT 0,
  block_write_bytes BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS container_metrics_agent_cid_ts_idx
  ON container_metrics (agent_id, container_id, ts DESC);
CREATE INDEX IF NOT EXISTS container_metrics_ts_idx ON container_metrics (ts);

CREATE TABLE IF NOT EXISTS agent_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR(64) NOT NULL REFERENCES agents (agent_id) ON DELETE CASCADE,
  container_id VARCHAR(128) NOT NULL DEFAULT '',
  action VARCHAR(32) NOT NULL,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_commands_pending_idx
  ON agent_commands (agent_id, status, created_at);
CREATE INDEX IF NOT EXISTS agent_commands_created_idx ON agent_commands (created_at);
`;
