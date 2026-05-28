'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { Loader2, Play, RefreshCw, Terminal } from 'lucide-react';
import { toast } from 'sonner';
import { timeAgo } from '@/lib/utils';

type CommandStatus = 'pending' | 'sent' | 'success' | 'failed';

interface ShellCommand {
  id: string;
  action: 'shell';
  args: {
    command?: string;
    cwd?: string;
    timeoutSeconds?: number;
  };
  status: CommandStatus;
  result: {
    stdout?: string;
    error?: string;
    exitCode?: number;
  };
  createdAt: string;
  sentAt?: string | null;
  completedAt?: string | null;
}

interface Settings {
  shellCommandEnabled: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

async function pollCommand(commandId: string, timeoutMs = 130_000): Promise<ShellCommand> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`/api/agents/commands/${commandId}`);
    if (res.ok) {
      const out = (await res.json()) as ShellCommand;
      if (out.status === 'success' || out.status === 'failed') return out;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Command timed out waiting for agent result');
}

export function TerminalPanel({ agentId }: { agentId: string }) {
  const [command, setCommand] = useState('docker ps');
  const [cwd, setCwd] = useState('/root');
  const [timeoutSeconds, setTimeoutSeconds] = useState('30');
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<ShellCommand | null>(null);

  const { data: settings } = useSWR<Settings>('/api/settings/alerts', fetcher);
  const {
    data,
    mutate,
    isLoading,
  } = useSWR<{ commands: ShellCommand[] }>(
    `/api/agents/${agentId}/terminal?limit=20`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const enabled = settings?.shellCommandEnabled === true;
  const commands = data?.commands ?? [];
  const latest = selected ?? commands[0] ?? null;

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed) return toast.error('Nhập lệnh cần chạy.');
    const timeout = Math.round(Number(timeoutSeconds));
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 120) {
      return toast.error('Timeout từ 1 đến 120 giây.');
    }

    setRunning(true);
    const toastId = toast.loading('Đã gửi lệnh, đang chờ agent xử lý…');
    try {
      const res = await fetch(`/api/agents/${agentId}/terminal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: trimmed,
          cwd: cwd.trim() || undefined,
          timeoutSeconds: timeout,
        }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        commandId?: string;
        error?: string;
      };
      if (!res.ok || !out.commandId) throw new Error(out.error ?? 'Không gửi được lệnh');

      const result = await pollCommand(out.commandId);
      setSelected(result);
      await mutate();
      if (result.status === 'success') {
        toast.success('Lệnh chạy xong', { id: toastId });
      } else {
        toast.error(result.result.error ?? 'Lệnh thất bại', { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi không xác định', { id: toastId });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Terminal className="h-4 w-4 text-ink-muted" />
            Terminal
          </h2>
          <p className="text-xs text-ink-soft">
            Chạy lệnh non-interactive qua agent. Output giới hạn 64 KB, timeout tối đa 120s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {enabled ? (
            <span className="chip-success text-[10px]">Enabled</span>
          ) : (
            <span className="chip-muted text-[10px]">Disabled in Settings</span>
          )}
          <button type="button" onClick={() => mutate()} className="btn-secondary">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <form onSubmit={run} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
              <div>
                <label className="label">Command</label>
                <textarea
                  className="input min-h-24 font-mono text-sm"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="docker ps"
                  disabled={!enabled || running}
                />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label">Working dir</label>
                  <input
                    className="input font-mono text-sm"
                    value={cwd}
                    onChange={(e) => setCwd(e.target.value)}
                    placeholder="/root"
                    disabled={!enabled || running}
                  />
                </div>
                <div>
                  <label className="label">Timeout (s)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={120}
                    value={timeoutSeconds}
                    onChange={(e) => setTimeoutSeconds(e.target.value)}
                    disabled={!enabled || running}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="btn-primary" disabled={!enabled || running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run command
              </button>
              {!enabled && (
                <span className="text-xs text-ink-soft">
                  Bật “Cho phép chạy lệnh terminal” trong Settings trước.
                </span>
              )}
            </div>
          </form>

          <div className="rounded-xl border border-border bg-bg-soft/60">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-semibold text-ink">Output</div>
              {latest && (
                <div className="flex items-center gap-2 text-xs text-ink-soft">
                  <span className={latest.status === 'success' ? 'text-success' : 'text-danger'}>
                    {latest.status}
                  </span>
                  <span>exit {latest.result.exitCode ?? '—'}</span>
                </div>
              )}
            </div>
            <pre className="min-h-64 max-h-[560px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-ink">
              {latest
                ? latest.result.stdout || latest.result.error || '(no output)'
                : 'Chưa có lệnh nào được chạy.'}
            </pre>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg-soft/40">
          <div className="border-b border-border px-4 py-3">
            <div className="text-sm font-semibold text-ink">History</div>
            <div className="text-xs text-ink-soft">{isLoading ? 'Loading…' : `${commands.length} commands`}</div>
          </div>
          <div className="max-h-[720px] divide-y divide-border overflow-auto">
            {commands.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ink-muted">No commands yet.</div>
            ) : (
              commands.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => setSelected(cmd)}
                  className={`block w-full px-4 py-3 text-left hover:bg-bg-muted ${
                    selected?.id === cmd.id ? 'bg-bg-muted/80' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs text-ink">
                      {cmd.args.command ?? '(empty)'}
                    </span>
                    <span className={cmd.status === 'success' ? 'text-xs text-success' : 'text-xs text-danger'}>
                      {cmd.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-ink-soft">{timeAgo(cmd.createdAt)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
