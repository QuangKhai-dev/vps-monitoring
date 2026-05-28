import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppSettings } from '@/lib/app-settings';
import { connectDB } from '@/lib/db';
import { env } from '@/lib/env';
import { Agent } from '@/lib/models/Agent';
import { AgentCommand } from '@/lib/models/AgentCommand';
import { Container, ContainerMetric } from '@/lib/models/Container';
import { Metric } from '@/lib/models/Metric';
import { sendTelegramOverloadIfNeeded } from '@/lib/telegram-alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const containerPortSchema = z
  .object({
    host: z.number().nullable().optional(),
    container: z.number().nullable().optional(),
    protocol: z.string().nullable().optional(),
    ip: z.string().nullable().optional(),
  })
  .passthrough();

const containerSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().max(255).optional().default(''),
    image: z.string().max(512).optional().default(''),
    imageId: z.string().max(128).optional().default(''),
    status: z.string().max(32).optional().default('unknown'),
    state: z.string().max(32).optional().default(''),
    statusText: z.string().optional(),
    health: z.string().max(32).optional().default(''),
    createdAt: z.string().nullable().optional(),
    startedAt: z.string().nullable().optional(),
    ports: z.array(containerPortSchema).max(64).optional().default([]),
    cpuPercent: z.number().min(0).max(100_000).optional().default(0),
    memUsedBytes: z.number().min(0).optional().default(0),
    memLimitBytes: z.number().min(0).optional().default(0),
    netRxBytes: z.number().min(0).optional().default(0),
    netTxBytes: z.number().min(0).optional().default(0),
    blockReadBytes: z.number().min(0).optional().default(0),
    blockWriteBytes: z.number().min(0).optional().default(0),
  })
  .passthrough();

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
  containers: z.array(containerSchema).max(500).optional(),
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Containers that vanished from heartbeats for more than 5 min are marked 'removed'. */
const CONTAINER_STALE_MS = 5 * 60 * 1000;

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

  if (parsed.data.containers) {
    try {
      const presentIds: string[] = [];
      for (const c of parsed.data.containers) {
        presentIds.push(c.id);
        await Container.upsert({
          agentId: agent.agentId,
          containerId: c.id,
          name: c.name ?? '',
          image: c.image ?? '',
          imageId: c.imageId ?? '',
          status: c.state || c.status || 'unknown',
          state: c.state ?? '',
          health: c.health ?? '',
          createdAtDocker: parseDate(c.createdAt),
          startedAtDocker: parseDate(c.startedAt),
          ports: c.ports ?? [],
          cpuPercent: c.cpuPercent ?? 0,
          memUsedBytes: c.memUsedBytes ?? 0,
          memLimitBytes: c.memLimitBytes ?? 0,
          netRxBytes: c.netRxBytes ?? 0,
          netTxBytes: c.netTxBytes ?? 0,
          blockReadBytes: c.blockReadBytes ?? 0,
          blockWriteBytes: c.blockWriteBytes ?? 0,
          lastSeenAt: now,
        });
        if ((c.state || c.status) === 'running') {
          await ContainerMetric.create({
            agentId: agent.agentId,
            containerId: c.id,
            ts: now,
            cpuPercent: c.cpuPercent ?? 0,
            memUsedBytes: c.memUsedBytes ?? 0,
            memLimitBytes: c.memLimitBytes ?? 0,
            netRxBytes: c.netRxBytes ?? 0,
            netTxBytes: c.netTxBytes ?? 0,
            blockReadBytes: c.blockReadBytes ?? 0,
            blockWriteBytes: c.blockWriteBytes ?? 0,
          });
        }
      }
      const stale = new Date(now.getTime() - CONTAINER_STALE_MS);
      await Container.markRemoved(agent.agentId, presentIds, stale);
    } catch (err) {
      console.error('[heartbeat] container ingest failed', err);
    }
  }

  let pendingCommands: Array<{
    id: string;
    action: string;
    containerId: string;
    args: Record<string, unknown>;
  }> = [];
  try {
    const claimed = await AgentCommand.claimPending(agent.agentId);
    pendingCommands = claimed.map((c) => ({
      id: c.id,
      action: c.action,
      containerId: c.containerId,
      args: c.args ?? {},
    }));
  } catch (err) {
    console.error('[heartbeat] claim commands failed', err);
  }

  return NextResponse.json({ ok: true, pendingCommands });
}
