import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getPublicAlertSettings,
  updateAppSettings,
} from '@/lib/app-settings';
import { getSessionFromCookies } from '@/lib/auth';
import { TelegramTokenRejectedError } from '@/lib/telegram-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const putSchema = z.object({
  telegramBotToken: z.string().max(512).optional(),
  clearTelegramBotToken: z.boolean().optional(),
  telegramChatId: z.string().max(64).optional(),
  alertCpuPercent: z.number().int().min(1).max(100).optional(),
  alertRamPercent: z.number().int().min(1).max(100).optional(),
  alertDiskPercent: z.number().int().min(1).max(100).optional(),
  telegramCooldownSeconds: z.number().int().min(60).max(86_400).optional(),
  containerMetricsRetentionDays: z.number().int().min(1).max(90).optional(),
  containerControlEnabled: z.boolean().optional(),
  shellCommandEnabled: z.boolean().optional(),
});

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const settings = await getPublicAlertSettings();
    return NextResponse.json(settings);
  } catch (e) {
    console.error('[settings/alerts GET]', e);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const settings = await updateAppSettings(parsed.data);
    return NextResponse.json(settings);
  } catch (e) {
    if (e instanceof TelegramTokenRejectedError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error('[settings/alerts PUT]', e);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
