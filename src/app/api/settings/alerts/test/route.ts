import { NextResponse } from 'next/server';
import { getAppSettings } from '@/lib/app-settings';
import { getSessionFromCookies } from '@/lib/auth';
import { isTelegramAlertsConfigured, sendTelegramSettingsTest } from '@/lib/telegram-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const settings = await getAppSettings();
    if (!isTelegramAlertsConfigured(settings)) {
      return NextResponse.json(
        { error: 'Chưa có bot token và chat id. Lưu cấu hình trước khi gửi thử.' },
        { status: 400 }
      );
    }
    const ok = await sendTelegramSettingsTest(settings);
    if (!ok) {
      return NextResponse.json(
        { error: 'Telegram từ chối tin (kiểm tra token, chat id, quyền bot trong nhóm).' },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[settings/alerts/test]', e);
    return NextResponse.json({ error: 'Gửi thử thất bại' }, { status: 500 });
  }
}
