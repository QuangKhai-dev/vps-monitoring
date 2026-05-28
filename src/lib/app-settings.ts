import { connectDB } from '@/lib/db';
import { AppSettings, type IAppSettings } from '@/lib/models/AppSettings';
import {
  sanitizeTelegramBotToken,
  sanitizeTelegramChatId,
  telegramGetMe,
  TelegramTokenRejectedError,
} from '@/lib/telegram-client';

export type ResolvedAppSettings = {
  telegramBotToken: string | undefined;
  telegramChatId: string | undefined;
  alertCpuPercent: number;
  alertRamPercent: number;
  alertDiskPercent: number;
  telegramCooldownSeconds: number;
  containerMetricsRetentionDays: number;
  containerMetricsIntervalSeconds: number;
  containerControlEnabled: boolean;
  shellCommandEnabled: boolean;
};

const CACHE_TTL_MS = 5000;
let cache: { expiresAt: number; value: ResolvedAppSettings } | null = null;

function toResolved(doc: IAppSettings): ResolvedAppSettings {
  const rawT = doc.telegramBotToken ?? '';
  const rawC = doc.telegramChatId ?? '';
  const token = rawT ? sanitizeTelegramBotToken(rawT) : '';
  const chat = rawC ? sanitizeTelegramChatId(rawC) : '';
  return {
    telegramBotToken: token || undefined,
    telegramChatId: chat || undefined,
    alertCpuPercent: doc.alertCpuPercent,
    alertRamPercent: doc.alertRamPercent,
    alertDiskPercent: doc.alertDiskPercent,
    telegramCooldownSeconds: doc.telegramCooldownSeconds,
    containerMetricsRetentionDays: doc.containerMetricsRetentionDays,
    containerMetricsIntervalSeconds: doc.containerMetricsIntervalSeconds,
    containerControlEnabled: doc.containerControlEnabled,
    shellCommandEnabled: doc.shellCommandEnabled,
  };
}

async function loadDoc() {
  await connectDB();
  let doc = await AppSettings.findOne({ __singleton: 1 });
  if (doc) return doc;
  try {
    doc = await AppSettings.create({ __singleton: 1 });
    return doc;
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: string }).code) : '';
    if (code === '23505') {
      const again = await AppSettings.findOne({ __singleton: 1 });
      if (again) return again;
    }
    throw e;
  }
}

export function invalidateAppSettingsCache(): void {
  cache = null;
}

export async function getAppSettings(): Promise<ResolvedAppSettings> {
  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return cache.value;
  }
  const doc = await loadDoc();
  const value = toResolved(doc);
  cache = { expiresAt: now + CACHE_TTL_MS, value };
  return value;
}

export type PublicAlertSettings = {
  botTokenConfigured: boolean;
  telegramChatId: string;
  alertCpuPercent: number;
  alertRamPercent: number;
  alertDiskPercent: number;
  telegramCooldownSeconds: number;
  containerMetricsRetentionDays: number;
  containerMetricsIntervalSeconds: number;
  containerControlEnabled: boolean;
  shellCommandEnabled: boolean;
};

export async function getPublicAlertSettings(): Promise<PublicAlertSettings> {
  const doc = await loadDoc();
  const r = toResolved(doc);
  return {
    botTokenConfigured: Boolean(r.telegramBotToken),
    telegramChatId: r.telegramChatId ?? '',
    alertCpuPercent: r.alertCpuPercent,
    alertRamPercent: r.alertRamPercent,
    alertDiskPercent: r.alertDiskPercent,
    telegramCooldownSeconds: r.telegramCooldownSeconds,
    containerMetricsRetentionDays: r.containerMetricsRetentionDays,
    containerMetricsIntervalSeconds: r.containerMetricsIntervalSeconds,
    containerControlEnabled: r.containerControlEnabled,
    shellCommandEnabled: r.shellCommandEnabled,
  };
}

export type UpdateAppSettingsInput = {
  telegramBotToken?: string;
  /** When true, clears stored bot token (ignored if a new non-empty token is sent). */
  clearTelegramBotToken?: boolean;
  telegramChatId?: string;
  alertCpuPercent?: number;
  alertRamPercent?: number;
  alertDiskPercent?: number;
  telegramCooldownSeconds?: number;
  containerMetricsRetentionDays?: number;
  containerMetricsIntervalSeconds?: number;
  containerControlEnabled?: boolean;
  shellCommandEnabled?: boolean;
};

export async function updateAppSettings(input: UpdateAppSettingsInput): Promise<PublicAlertSettings> {
  const doc = await loadDoc();

  const newToken = input.telegramBotToken?.trim();
  if (newToken) {
    const clean = sanitizeTelegramBotToken(newToken);
    if (!clean.includes(':')) {
      throw new TelegramTokenRejectedError(
        'Token bot không đúng định dạng (cần dạng 123456789:AAH… từ @BotFather).'
      );
    }
    const me = await telegramGetMe(clean);
    if (!me.ok) {
      throw new TelegramTokenRejectedError(me.description);
    }
    doc.telegramBotToken = clean;
  } else if (input.clearTelegramBotToken) {
    doc.telegramBotToken = '';
  }

  if (input.telegramChatId !== undefined) {
    doc.telegramChatId = sanitizeTelegramChatId(input.telegramChatId);
  }
  if (input.alertCpuPercent !== undefined) {
    doc.alertCpuPercent = Math.max(1, Math.min(100, Math.round(input.alertCpuPercent)));
  }
  if (input.alertRamPercent !== undefined) {
    doc.alertRamPercent = Math.max(1, Math.min(100, Math.round(input.alertRamPercent)));
  }
  if (input.alertDiskPercent !== undefined) {
    doc.alertDiskPercent = Math.max(1, Math.min(100, Math.round(input.alertDiskPercent)));
  }
  if (input.telegramCooldownSeconds !== undefined) {
    const c = Math.round(input.telegramCooldownSeconds);
    doc.telegramCooldownSeconds = Math.max(60, Math.min(86_400, c));
  }
  if (input.containerMetricsRetentionDays !== undefined) {
    const d = Math.round(input.containerMetricsRetentionDays);
    doc.containerMetricsRetentionDays = Math.max(1, Math.min(90, d));
  }
  if (input.containerMetricsIntervalSeconds !== undefined) {
    const s = Math.round(input.containerMetricsIntervalSeconds);
    doc.containerMetricsIntervalSeconds = Math.max(5, Math.min(3600, s));
  }
  if (input.containerControlEnabled !== undefined) {
    doc.containerControlEnabled = Boolean(input.containerControlEnabled);
  }
  if (input.shellCommandEnabled !== undefined) {
    doc.shellCommandEnabled = Boolean(input.shellCommandEnabled);
  }

  await doc.save();
  invalidateAppSettingsCache();
  return getPublicAlertSettings();
}
