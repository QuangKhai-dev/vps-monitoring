import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Container } from '@/lib/models/Container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { agentId: string };
}

export async function GET(req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const includeRemoved = url.searchParams.get('includeRemoved') === '1';

  await connectDB();
  const list = await Container.findByAgent(params.agentId, { includeRemoved });

  const containers = list.map((c) => ({
    containerId: c.containerId,
    name: c.name,
    image: c.image,
    imageId: c.imageId,
    status: c.status,
    state: c.state,
    health: c.health,
    createdAt: c.createdAtDocker,
    startedAt: c.startedAtDocker,
    ports: c.ports,
    cpuPercent: c.cpuPercent,
    memUsedBytes: c.memUsedBytes,
    memLimitBytes: c.memLimitBytes,
    netRxBytes: c.netRxBytes,
    netTxBytes: c.netTxBytes,
    blockReadBytes: c.blockReadBytes,
    blockWriteBytes: c.blockWriteBytes,
    lastSeenAt: c.lastSeenAt,
    updatedAt: c.updatedAt,
  }));

  const running = containers.filter((c) => c.status === 'running').length;
  return NextResponse.json({ containers, running, total: containers.length });
}
