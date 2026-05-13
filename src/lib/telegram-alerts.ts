import type { ResolvedAppSettings } from './app-settings';
import { formatBytes, percent } from './utils';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function isTelegramAlertsConfigured(settings: ResolvedAppSettings): boolean {
  return Boolean(settings.telegramBotToken && settings.telegramChatId);
}

export type HeartbeatForAlert = {
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
};

export function evaluateOverload(
  m: HeartbeatForAlert,
  thresholds: { cpu: number; ram: number; disk: number }
): {
  ramPct: number;
  diskPct: number;
  cpuHigh: boolean;
  ramHigh: boolean;
  diskHigh: boolean;
} {
  const ramPct = percent(m.memUsedBytes, m.memTotalBytes);
  const diskPct = percent(m.diskUsedBytes, m.diskTotalBytes);
  return {
    ramPct,
    diskPct,
    cpuHigh: m.cpuPercent >= thresholds.cpu,
    ramHigh: ramPct >= thresholds.ram,
    diskHigh: diskPct >= thresholds.disk,
  };
}

/**
 * Sends one Telegram message if any metric is over threshold and cooldown elapsed.
 * Does not throw — logs failures only.
 */
export async function sendTelegramOverloadIfNeeded(
  agent: {
    agentId: string;
    hostname: string;
    label?: string | null;
    publicIp?: string | null;
    lastTelegramAlertAt?: Date | null;
  },
  m: HeartbeatForAlert,
  settings: ResolvedAppSettings,
  appUrl: string
): Promise<boolean> {
  if (!isTelegramAlertsConfigured(settings)) return false;

  const thresholds = {
    cpu: settings.alertCpuPercent,
    ram: settings.alertRamPercent,
    disk: settings.alertDiskPercent,
  };
  const ev = evaluateOverload(m, thresholds);
  if (!ev.cpuHigh && !ev.ramHigh && !ev.diskHigh) return false;

  const cooldownMs = settings.telegramCooldownSeconds * 1000;
  const last = agent.lastTelegramAlertAt ? new Date(agent.lastTelegramAlertAt).getTime() : 0;
  if (last && Date.now() - last < cooldownMs) return false;

  const displayName = (agent.label?.trim() || agent.hostname || agent.agentId).slice(0, 200);
  const lines: string[] = [
    `<b>⚠️ VPS Monitor — tài nguyên vượt ngưỡng</b>`,
    `<b>Máy:</b> ${escapeHtml(displayName)}`,
    `<code>${escapeHtml(agent.agentId)}</code>`,
  ];
  if (agent.publicIp) lines.push(`<b>IP:</b> <code>${escapeHtml(agent.publicIp)}</code>`);

  if (ev.cpuHigh) {
    lines.push(`<b>CPU:</b> ${m.cpuPercent.toFixed(1)}% <i>(≥ ${thresholds.cpu}%)</i>`);
  }
  if (ev.ramHigh) {
    lines.push(
      `<b>RAM:</b> ${ev.ramPct.toFixed(1)}% — ${formatBytes(m.memUsedBytes)} / ${formatBytes(
        m.memTotalBytes
      )} <i>(≥ ${thresholds.ram}%)</i>`
    );
  }
  if (ev.diskHigh) {
    lines.push(
      `<b>Ổ đĩa (/):</b> ${ev.diskPct.toFixed(1)}% — ${formatBytes(m.diskUsedBytes)} / ${formatBytes(
        m.diskTotalBytes
      )} <i>(≥ ${thresholds.disk}%)</i>`
    );
  }

  const base = appUrl.replace(/\/$/, '');
  const url = `${base}/servers/${encodeURIComponent(agent.agentId)}`;
  const href = url.replace(/&/g, '&amp;');
  lines.push(`<a href="${href}">Mở chi tiết trên dashboard</a>`);

  const ok = await postTelegramHtml(
    lines.join('\n'),
    settings.telegramBotToken!,
    settings.telegramChatId!
  );
  return ok;
}

/** Sends a short test message (Settings → “Gửi tin thử”). */
export async function sendTelegramSettingsTest(settings: ResolvedAppSettings): Promise<boolean> {
  if (!isTelegramAlertsConfigured(settings)) return false;
  return postTelegramHtml(
    `<b>VPS Monitor</b>\n${escapeHtml(
      'Thử nghiệm — nếu bạn thấy tin này, bot và chat id đã đúng.'
    )}`,
    settings.telegramBotToken!,
    settings.telegramChatId!
  );
}

async function postTelegramHtml(html: string, token: string, chatId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      console.error('[telegram] sendMessage failed:', res.status, data?.description ?? data);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[telegram] sendMessage error:', e);
    return false;
  }
}
