import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { AgentCommand } from '@/lib/models/AgentCommand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { commandId: string };
}

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const cmd = await AgentCommand.findById(params.commandId);
  if (!cmd) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    id: cmd.id,
    agentId: cmd.agentId,
    containerId: cmd.containerId,
    action: cmd.action,
    args: cmd.args,
    status: cmd.status,
    result: cmd.result,
    createdAt: cmd.createdAt,
    sentAt: cmd.sentAt,
    completedAt: cmd.completedAt,
  });
}
