import { connectDB } from '@/lib/db';
import { AppSettings, type IAppSettings } from '@/lib/models/AppSettings';

export type ResolvedAppSettings = {
  telegramBotToken: string | undefined;
  telegramChatId: string | undefined;
  alertCpuPercent: number;
  alertRamPercent: number;
  alertDiskPercent: number;
  telegramCooldownSeconds: number;
};

const CACHE_TTL_MS = 5000;
let cache: { expiresAt: number; value: ResolvedAppSettings } | null = null;

function toResolved(doc: IAppSettings): ResolvedAppSettings {
  const token = doc.telegramBotToken?.trim();
  const chat = doc.telegramChatId?.trim();
  return {
    telegramBotToken: token || undefined,
    telegramChatId: chat || undefined,
    alertCpuPercent: doc.alertCpuPercent,
    alertRamPercent: doc.alertRamPercent,
    alertDiskPercent: doc.alertDiskPercent,
    telegramCooldownSeconds: doc.telegramCooldownSeconds,
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
    const code = typeof e === 'object' && e !== null && 'code' in e ? (e as { code: number }).code : 0;
    if (code === 11_000) {
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
};

export async function updateAppSettings(input: UpdateAppSettingsInput): Promise<PublicAlertSettings> {
  const doc = await loadDoc();

  const newToken = input.telegramBotToken?.trim();
  if (newToken) {
    doc.telegramBotToken = newToken;
  } else if (input.clearTelegramBotToken) {
    doc.telegramBotToken = '';
  }

  if (input.telegramChatId !== undefined) {
    doc.telegramChatId = input.telegramChatId.trim();
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

  await doc.save();
  invalidateAppSettingsCache();
  return getPublicAlertSettings();
}
