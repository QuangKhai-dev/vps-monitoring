import { getPool } from '@/lib/db';

export interface IAppSettings {
  __singleton: number;
  telegramBotToken: string;
  telegramChatId: string;
  alertCpuPercent: number;
  alertRamPercent: number;
  alertDiskPercent: number;
  telegramCooldownSeconds: number;
  containerMetricsRetentionDays: number;
  containerMetricsIntervalSeconds: number;
  containerControlEnabled: boolean;
  shellCommandEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type AppSettingsDocument = IAppSettings & {
  save: () => Promise<void>;
};

type AppSettingsRow = {
  singleton: number;
  telegram_bot_token: string;
  telegram_chat_id: string;
  alert_cpu_percent: number;
  alert_ram_percent: number;
  alert_disk_percent: number;
  telegram_cooldown_seconds: number;
  container_metrics_retention_days: number;
  container_metrics_interval_seconds: number;
  container_control_enabled: boolean;
  shell_command_enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

function rowToSettings(row: AppSettingsRow): IAppSettings {
  return {
    __singleton: row.singleton,
    telegramBotToken: row.telegram_bot_token,
    telegramChatId: row.telegram_chat_id,
    alertCpuPercent: row.alert_cpu_percent,
    alertRamPercent: row.alert_ram_percent,
    alertDiskPercent: row.alert_disk_percent,
    telegramCooldownSeconds: row.telegram_cooldown_seconds,
    containerMetricsRetentionDays: row.container_metrics_retention_days ?? 7,
    containerMetricsIntervalSeconds: row.container_metrics_interval_seconds ?? 30,
    containerControlEnabled: row.container_control_enabled ?? true,
    shellCommandEnabled: row.shell_command_enabled ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asDocument(settings: IAppSettings): AppSettingsDocument {
  return {
    ...settings,
    async save() {
      const pool = await getPool();
      await pool.query(
        `UPDATE app_settings SET
          telegram_bot_token = $1,
          telegram_chat_id = $2,
          alert_cpu_percent = $3,
          alert_ram_percent = $4,
          alert_disk_percent = $5,
          telegram_cooldown_seconds = $6,
          container_metrics_retention_days = $7,
          container_metrics_interval_seconds = $8,
          container_control_enabled = $9,
          shell_command_enabled = $10,
          updated_at = NOW()
        WHERE singleton = 1`,
        [
          settings.telegramBotToken,
          settings.telegramChatId,
          settings.alertCpuPercent,
          settings.alertRamPercent,
          settings.alertDiskPercent,
          settings.telegramCooldownSeconds,
          settings.containerMetricsRetentionDays,
          settings.containerMetricsIntervalSeconds,
          settings.containerControlEnabled,
          settings.shellCommandEnabled,
        ]
      );
    },
  };
}

export const AppSettings = {
  async findOne(filter: { __singleton: number }): Promise<AppSettingsDocument | null> {
    void filter;
    const pool = await getPool();
    const r = await pool.query<AppSettingsRow>(
      'SELECT * FROM app_settings WHERE singleton = 1 LIMIT 1'
    );
    const row = r.rows[0];
    return row ? asDocument(rowToSettings(row)) : null;
  },

  async create(data: { __singleton: number }): Promise<AppSettingsDocument> {
    const pool = await getPool();
    const r = await pool.query<AppSettingsRow>(
      `INSERT INTO app_settings (singleton) VALUES ($1) RETURNING *`,
      [data.__singleton]
    );
    return asDocument(rowToSettings(r.rows[0]));
  },
};
