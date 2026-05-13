import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppSettings } from '@/lib/app-settings';
import { connectDB } from '@/lib/db';
import { env } from '@/lib/env';
import { Agent } from '@/lib/models/Agent';
import { Metric } from '@/lib/models/Metric';
import { sendTelegramOverloadIfNeeded } from '@/lib/telegram-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  agentId: z.string().min(1),
  token: z.string().min(1),
  cpuPercent: z.number().min(0).max(100).default(0),
  loadAvg1: z.number().min(0).default(0),
  loadAvg5: z.number().min(0).default(0),
  loadAvg15: z.number().min(0).default(0),
  memUsedBytes: z.number().min(0).default(0),
  memTotalBytes: z.number().min(0).default(0),
  swapUsedBytes: z.number().min(0).default(0),
  swapTotalBytes: z.number().min(0).default(0),
  diskUsedBytes: z.number().min(0).default(0),
  diskTotalBytes: z.number().min(0).default(0),
  netRxBytes: z.number().min(0).default(0),
  netTxBytes: z.number().min(0).default(0),
  netRxBps: z.number().min(0).default(0),
  netTxBps: z.number().min(0).default(0),
  uptimeSeconds: z.number().min(0).default(0),
  processCount: z.number().int().min(0).default(0),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  await connectDB();

  const agent = await Agent.findOne({
    agentId: parsed.data.agentId,
    token: parsed.data.token,
  });

  if (!agent) {
    return NextResponse.json({ error: 'Unknown agent or invalid token' }, { status: 401 });
  }

  const now = new Date();
  agent.lastSeenAt = now;
  await agent.save();

  await Metric.create({
    agentId: agent.agentId,
    ts: now,
    cpuPercent: parsed.data.cpuPercent,
    loadAvg1: parsed.data.loadAvg1,
    loadAvg5: parsed.data.loadAvg5,
    loadAvg15: parsed.data.loadAvg15,
    memUsedBytes: parsed.data.memUsedBytes,
    memTotalBytes: parsed.data.memTotalBytes,
    swapUsedBytes: parsed.data.swapUsedBytes,
    swapTotalBytes: parsed.data.swapTotalBytes,
    diskUsedBytes: parsed.data.diskUsedBytes,
    diskTotalBytes: parsed.data.diskTotalBytes,
    netRxBytes: parsed.data.netRxBytes,
    netTxBytes: parsed.data.netTxBytes,
    netRxBps: parsed.data.netRxBps,
    netTxBps: parsed.data.netTxBps,
    uptimeSeconds: parsed.data.uptimeSeconds,
    processCount: parsed.data.processCount,
  });

  const appSettings = await getAppSettings();
  const sent = await sendTelegramOverloadIfNeeded(
    agent,
    {
      cpuPercent: parsed.data.cpuPercent,
      memUsedBytes: parsed.data.memUsedBytes,
      memTotalBytes: parsed.data.memTotalBytes,
      diskUsedBytes: parsed.data.diskUsedBytes,
      diskTotalBytes: parsed.data.diskTotalBytes,
    },
    appSettings,
    env.APP_URL
  );
  if (sent) {
    agent.lastTelegramAlertAt = now;
    await agent.save();
  }

  return NextResponse.json({ ok: true });
}
