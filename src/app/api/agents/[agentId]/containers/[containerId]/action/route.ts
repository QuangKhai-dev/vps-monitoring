import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppSettings } from '@/lib/app-settings';
import { getSessionFromCookies } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Agent } from '@/lib/models/Agent';
import { AgentCommand, type CommandAction } from '@/lib/models/AgentCommand';
import { Container } from '@/lib/models/Container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { agentId: string; containerId: string };
}

const bodySchema = z.object({
  action: z.enum(['start', 'stop', 'restart']),
});

export async function POST(req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await getAppSettings();
  if (!settings.containerControlEnabled) {
    return NextResponse.json({ error: 'Container control disabled' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
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
    action: parsed.data.action as CommandAction,
    createdByUserId: session.sub,
  });

  return NextResponse.json({ commandId: cmd.id, status: cmd.status });
}
