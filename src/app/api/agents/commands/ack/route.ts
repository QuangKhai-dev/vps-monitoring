import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Agent } from '@/lib/models/Agent';
import { AgentCommand } from '@/lib/models/AgentCommand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  agentId: z.string().min(1),
  token: z.string().min(1),
  commandId: z.string().uuid(),
  status: z.enum(['success', 'failed']),
  result: z
    .object({
      stdout: z.string().optional(),
      error: z.string().optional(),
      exitCode: z.number().int().optional(),
    })
    .passthrough()
    .optional()
    .default({}),
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

  // Cap stdout payload to 64 KB to keep DB rows reasonable.
  const stdout = (parsed.data.result.stdout ?? '').slice(0, 65_536);
  const error = (parsed.data.result.error ?? '').slice(0, 8_192);
  const exitCode = parsed.data.result.exitCode;

  const updated = await AgentCommand.ack(
    parsed.data.commandId,
    parsed.data.agentId,
    parsed.data.status,
    { stdout, error, exitCode }
  );
  if (!updated) {
    return NextResponse.json({ error: 'Command not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
