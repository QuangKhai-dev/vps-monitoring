import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAppSettings } from '@/lib/app-settings';
import { getSessionFromCookies } from '@/lib/auth';
import { connectDB } from '@/lib/db';
import { Agent } from '@/lib/models/Agent';
import { AgentCommand } from '@/lib/models/AgentCommand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { agentId: string };
}

const runSchema = z.object({
  command: z.string().trim().min(1).max(2000),
  cwd: z.string().trim().max(512).optional(),
  timeoutSeconds: z.number().int().min(1).max(120).optional().default(30),
});

function serializeCommand(cmd: Awaited<ReturnType<typeof AgentCommand.findById>>) {
  if (!cmd) return null;
  return {
    id: cmd.id,
    agentId: cmd.agentId,
    action: cmd.action,
    args: cmd.args,
    status: cmd.status,
    result: cmd.result,
    createdAt: cmd.createdAt,
    sentAt: cmd.sentAt,
    completedAt: cmd.completedAt,
  };
}

export async function GET(req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 20);

  await connectDB();
  const agent = await Agent.findOne({ agentId: params.agentId });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const commands = await AgentCommand.findRecentByAgent(params.agentId, {
    action: 'shell',
    limit,
  });
  return NextResponse.json({ commands: commands.map(serializeCommand) });
}

export async function POST(req: Request, { params }: RouteContext) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await getAppSettings();
  if (!settings.shellCommandEnabled) {
    return NextResponse.json({ error: 'Terminal command disabled' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();
  const agent = await Agent.findOne({ agentId: params.agentId });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const cmd = await AgentCommand.create({
    agentId: params.agentId,
    containerId: '',
    action: 'shell',
    args: {
      command: parsed.data.command,
      cwd: parsed.data.cwd || undefined,
      timeoutSeconds: parsed.data.timeoutSeconds,
    },
    createdByUserId: session.sub,
  });

  return NextResponse.json({ commandId: cmd.id, status: cmd.status });
}
