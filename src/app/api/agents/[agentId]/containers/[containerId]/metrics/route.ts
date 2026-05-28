import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { ContainerMetric } from '@/lib/models/Container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { agentId: string; containerId: string };
}

export async function GET(req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const range = url.searchParams.get('range') ?? '1h';

  const now = Date.now();
  let fromMs = now - 60 * 60 * 1000;
  if (range === '6h') fromMs = now - 6 * 60 * 60 * 1000;
  else if (range === '24h') fromMs = now - 24 * 60 * 60 * 1000;
  else if (range === '7d') fromMs = now - 7 * 24 * 60 * 60 * 1000;

  await connectDB();
  const rows = await ContainerMetric.findRange(
    params.agentId,
    params.containerId,
    new Date(fromMs),
    2000
  );

  const metrics = rows.map((m) => ({
    ts: m.ts,
    cpuPercent: m.cpuPercent,
    memUsedBytes: m.memUsedBytes,
    memLimitBytes: m.memLimitBytes,
    netRxBytes: m.netRxBytes,
    netTxBytes: m.netTxBytes,
    blockReadBytes: m.blockReadBytes,
    blockWriteBytes: m.blockWriteBytes,
  }));

  return NextResponse.json({ metrics });
}
