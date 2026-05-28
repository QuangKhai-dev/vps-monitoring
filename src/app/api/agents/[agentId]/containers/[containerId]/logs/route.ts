import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionFromCookies } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Agent } from '@/lib/models/Agent';
import { AgentCommand } from '@/lib/models/AgentCommand';
import { Container } from '@/lib/models/Container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { agentId: string; containerId: string };
}

const bodySchema = z.object({
  tail: z.number().int().min(1).max(2000).optional().default(200),
});

export async function POST(req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  await connectDB();
  const agent = await Agent.findOne({ agentId: params.agentId });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  const container = await Container.findOne(params.agentId, params.containerId);
  if (!container) return NextResponse.json({ error: 'Container not found' }, { status: 404 });

  const cmd = await AgentCommand.create({
    agentId: params.agentId,
    containerId: params.containerId,
    action: 'logs',
    args: { tail: parsed.data.tail },
    createdByUserId: session.sub,
  });

  return NextResponse.json({ commandId: cmd.id, status: cmd.status });
}
