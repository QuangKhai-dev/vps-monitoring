'use client';

import useSWR, { useSWRConfig } from 'swr';
import { useEffect, useState } from 'react';
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MetricChart } from '@/components/MetricChart';
import { ModalFrame } from '@/components/ModalFrame';
import { UsageBar } from '@/components/UsageBar';
import { formatBytes, percent, timeAgo } from '@/lib/utils';

interface ContainerPort {
  host?: number | null;
  container?: number | null;
  protocol?: string | null;
  ip?: string | null;
}

interface ContainerItem {
  containerId: string;
  name: string;
  image: string;
  imageId: string;
  status: string;
  state: string;
  health: string;
  createdAt?: string | null;
  startedAt?: string | null;
  ports: ContainerPort[];
  cpuPercent: number;
  memUsedBytes: number;
  memLimitBytes: number;
  netRxBytes: number;
  netTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  lastSeenAt: string;
  updatedAt: string;
}

interface ContainersResponse {
  containers: ContainerItem[];
  running: number;
  total: number;
}

interface MetricPoint {
  ts: string;
  cpuPercent: number;
  memUsedBytes: number;
  memLimitBytes: number;
  netRxBytes: number;
  netTxBytes: number;
}

interface AlertSettings {
  containerControlEnabled: boolean;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const RANGES: Array<{ v: '1h' | '6h' | '24h' | '7d'; label: string }> = [
  { v: '1h', label: '1h' },
  { v: '6h', label: '6h' },
  { v: '24h', label: '24h' },
  { v: '7d', label: '7d' },
];

function shortImage(image: string): string {
  if (!image) return '—';
  const parts = image.split('/');
  const last = parts[parts.length - 1];
  return last.length > 40 ? `${last.slice(0, 37)}…` : last;
}

function StateBadge({ state }: { state: string }) {
  const tone =
    state === 'running'
      ? 'chip-success'
      : state === 'exited' || state === 'dead'
        ? 'chip-muted'
        : state === 'restarting'
          ? 'chip-success'
          : 'chip-muted';
  return <span className={`chip ${tone} text-[10px] capitalize`}>{state || 'unknown'}</span>;
}

async function pollCommand(commandId: string, timeoutMs = 60_000): Promise<{
  status: 'success' | 'failed';
  result: { stdout?: string; error?: string };
}> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`/api/agents/commands/${commandId}`);
    if (res.ok) {
      const out = (await res.json()) as {
        status: string;
        result: { stdout?: string; error?: string };
      };
      if (out.status === 'success' || out.status === 'failed') {
        return { status: out.status, result: out.result ?? {} };
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('timeout');
}

export function ContainersTab({ agentId }: { agentId: string }) {
  const { mutate } = useSWRConfig();
  const { data, isLoading } = useSWR<ContainersResponse>(
    `/api/agents/${agentId}/containers`,
    fetcher,
    { refreshInterval: 5000 }
  );
  const { data: settings } = useSWR<AlertSettings>('/api/settings/alerts', fetcher);
  const controlEnabled = settings?.containerControlEnabled !== false;

  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    | { action: 'stop' | 'restart'; containerId: string; name: string }
    | null
  >(null);
  const [logsContext, setLogsContext] = useState<{
    containerId: string;
    name: string;
  } | null>(null);

  const refresh = () => mutate(`/api/agents/${agentId}/containers`);

  const sendAction = async (
    containerId: string,
    action: 'start' | 'stop' | 'restart',
    name: string
  ) => {
    const key = `${containerId}:${action}`;
    setPendingAction(key);
    const toastId = toast.loading(`Đang ${action} ${name}…`);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/containers/${containerId}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      const out = (await res.json().catch(() => ({}))) as {
        commandId?: string;
        error?: string;
      };
      if (!res.ok || !out.commandId) {
        throw new Error(out.error ?? 'Không gửi được lệnh');
      }
      const result = await pollCommand(out.commandId);
      if (result.status === 'success') {
        toast.success(`${action} thành công`, { id: toastId });
      } else {
        toast.error(
          `${action} thất bại: ${result.result.error ?? 'không rõ lỗi'}`,
          { id: toastId }
        );
      }
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi không xác định';
      toast.error(msg, { id: toastId });
    } finally {
      setPendingAction(null);
    }
  };

  const containers = data?.containers ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Boxes className="h-4 w-4 text-ink-muted" />
            Docker containers
          </h2>
          <p className="text-xs text-ink-soft">
            {isLoading
              ? 'Loading…'
              : data
                ? `${data.running} running · ${data.total} total`
                : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!controlEnabled && (
            <span className="chip-muted text-[10px]">Control disabled</span>
          )}
          <button onClick={refresh} className="btn-secondary">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {containers.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-ink-muted">
          {isLoading
            ? 'Đang tải danh sách container…'
            : 'Chưa thấy container nào. Cài hoặc bật Docker trên VPS rồi đợi heartbeat tiếp theo (≤ 30s).'}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {containers.map((c) => {
            const memPct = percent(c.memUsedBytes, c.memLimitBytes);
            const isRunning = c.state === 'running';
            const isExpanded = expanded === c.containerId;
            const isBusy = pendingAction?.startsWith(c.containerId) ?? false;
            return (
              <div key={c.containerId} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(isExpanded ? null : c.containerId)
                    }
                    className="mt-1 rounded p-0.5 text-ink-soft hover:text-ink"
                    aria-label="Toggle details"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-sm font-semibold text-ink">
                        {c.name || c.containerId.slice(0, 12)}
                      </span>
                      <StateBadge state={c.state || c.status} />
                      {c.health && c.health !== '' && (
                        <span className="chip-muted text-[10px]">{c.health}</span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-xs text-ink-soft">
                      <span className="font-mono">{shortImage(c.image)}</span>
                      {c.ports.length > 0 && (
                        <span className="ml-2">
                          {c.ports
                            .filter((p) => p.container)
                            .slice(0, 4)
                            .map((p, i) => (
                              <span
                                key={i}
                                className="ml-1 rounded bg-bg-muted/70 px-1.5 py-0.5 text-[10px] font-mono"
                              >
                                {p.host ? `${p.host}:` : ''}
                                {p.container}/{p.protocol ?? 'tcp'}
                              </span>
                            ))}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid w-full grid-cols-3 gap-2 text-xs sm:w-72">
                    <Metric label="CPU" value={`${c.cpuPercent.toFixed(1)}%`} />
                    <Metric
                      label="MEM"
                      value={
                        c.memLimitBytes
                          ? `${memPct.toFixed(0)}%`
                          : formatBytes(c.memUsedBytes)
                      }
                      hint={`${formatBytes(c.memUsedBytes)} / ${formatBytes(c.memLimitBytes)}`}
                    />
                    <Metric label="Updated" value={timeAgo(c.lastSeenAt)} />
                  </div>

                  <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                    <IconButton
                      label="Start"
                      icon={Play}
                      tone="success"
                      busy={isBusy && pendingAction === `${c.containerId}:start`}
                      disabled={!controlEnabled || isRunning || isBusy}
                      onClick={() => sendAction(c.containerId, 'start', c.name)}
                    />
                    <IconButton
                      label="Restart"
                      icon={RotateCcw}
                      tone="warning"
                      busy={isBusy && pendingAction === `${c.containerId}:restart`}
                      disabled={!controlEnabled || !isRunning || isBusy}
                      onClick={() =>
                        setConfirmAction({
                          action: 'restart',
                          containerId: c.containerId,
                          name: c.name,
                        })
                      }
                    />
                    <IconButton
                      label="Stop"
                      icon={Square}
                      tone="danger"
                      busy={isBusy && pendingAction === `${c.containerId}:stop`}
                      disabled={!controlEnabled || !isRunning || isBusy}
                      onClick={() =>
                        setConfirmAction({
                          action: 'stop',
                          containerId: c.containerId,
                          name: c.name,
                        })
                      }
                    />
                    <IconButton
                      label="Logs"
                      icon={FileText}
                      tone="default"
                      busy={false}
                      disabled={isBusy}
                      onClick={() =>
                        setLogsContext({
                          containerId: c.containerId,
                          name: c.name,
                        })
                      }
                    />
                  </div>
                </div>

                {isExpanded && (
                  <ContainerCharts
                    agentId={agentId}
                    container={c}
                    memPct={memPct}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction?.action === 'stop'
            ? 'Dừng container?'
            : 'Khởi động lại container?'
        }
        description={
          <>
            {confirmAction?.action === 'stop' ? 'Sẽ dừng ' : 'Sẽ restart '}
            <span className="font-mono font-semibold text-ink">
              {confirmAction?.name}
            </span>{' '}
            ngay khi heartbeat tiếp theo của agent (≤ 30s).
          </>
        }
        cancelLabel="Huỷ"
        confirmLabel={confirmAction?.action === 'stop' ? 'Dừng' : 'Restart'}
        tone={confirmAction?.action === 'stop' ? 'danger' : 'default'}
        onConfirm={async () => {
          if (!confirmAction) return;
          await sendAction(
            confirmAction.containerId,
            confirmAction.action,
            confirmAction.name
          );
        }}
      />

      {logsContext && (
        <LogsModal
          agentId={agentId}
          containerId={logsContext.containerId}
          name={logsContext.name}
          onClose={() => setLogsContext(null)}
        />
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-bg-muted/60 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-ink" title={hint}>
        {value}
      </div>
    </div>
  );
}

function IconButton({
  label,
  icon: Icon,
  tone,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof Play;
  tone: 'success' | 'danger' | 'warning' | 'default';
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const cls =
    tone === 'success'
      ? 'text-success hover:bg-success/10'
      : tone === 'danger'
        ? 'text-danger hover:bg-danger/10'
        : tone === 'warning'
          ? 'text-warning hover:bg-warning/10'
          : 'text-ink-soft hover:bg-bg-muted hover:text-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={label}
      aria-label={label}
      className={`rounded-md border border-border bg-bg-card p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${cls}`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
    </button>
  );
}

function ContainerCharts({
  agentId,
  container,
  memPct,
}: {
  agentId: string;
  container: ContainerItem;
  memPct: number;
}) {
  const [range, setRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h');
  const { data, isLoading } = useSWR<{ metrics: MetricPoint[] }>(
    `/api/agents/${agentId}/containers/${container.containerId}/metrics?range=${range}`,
    fetcher,
    { refreshInterval: 10_000 }
  );
  const metrics = data?.metrics ?? [];
  return (
    <div className="mt-4 rounded-xl border border-border bg-bg-soft/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <UsageBar value={container.cpuPercent} label="CPU" hint={`${container.cpuPercent.toFixed(1)}%`} />
          <UsageBar
            value={memPct}
            label="Memory"
            hint={`${formatBytes(container.memUsedBytes)} / ${formatBytes(container.memLimitBytes)}`}
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-bg-muted p-1 text-xs">
          {RANGES.map((r) => (
            <button
              key={r.v}
              onClick={() => setRange(r.v)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                range === r.v
                  ? 'bg-bg-card text-ink shadow'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-semibold text-ink-soft">CPU %</div>
          <MetricChart
            data={metrics}
            series={[{ key: 'cpuPercent', label: 'CPU', color: '#a1a1aa' }]}
            yFormatter={(v) => `${v.toFixed(0)}%`}
            domain={[0, 'auto']}
            height={160}
          />
          {isLoading && metrics.length === 0 && (
            <p className="mt-2 text-xs text-ink-soft">Loading…</p>
          )}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold text-ink-soft">Memory used</div>
          <MetricChart
            data={metrics}
            series={[
              {
                key: 'memUsedBytes',
                label: 'Mem',
                color: '#71717a',
                formatter: (v) => formatBytes(v),
              },
            ]}
            yFormatter={(v) => formatBytes(v)}
            height={160}
          />
        </div>
      </div>
    </div>
  );
}

function LogsModal({
  agentId,
  containerId,
  name,
  onClose,
}: {
  agentId: string;
  containerId: string;
  name: string;
  onClose: () => void;
}) {
  const [tail, setTail] = useState(200);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  const fetchLogs = async (n: number) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/containers/${containerId}/logs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tail: n }),
        }
      );
      const out = (await res.json().catch(() => ({}))) as {
        commandId?: string;
        error?: string;
      };
      if (!res.ok || !out.commandId) {
        throw new Error(out.error ?? 'Không gửi được lệnh');
      }
      const result = await pollCommand(out.commandId);
      if (result.status === 'success') {
        setLogs(result.result.stdout ?? '');
      } else {
        setErr(result.result.error ?? 'Không lấy được logs');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs(tail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, containerId]);

  return (
    <ModalFrame open onClose={onClose}>
      <div className="card relative w-[min(960px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Logs · {name}</h2>
            <p className="text-xs text-ink-soft">
              Lấy {tail} dòng cuối · max 64 KB
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={tail}
              onChange={(e) => {
                const n = Number(e.target.value);
                setTail(n);
                void fetchLogs(n);
              }}
              className="input h-9 w-auto"
            >
              {[100, 200, 500, 1000, 2000].map((n) => (
                <option key={n} value={n}>
                  {n} dòng
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void fetchLogs(tail)}
              className="btn-secondary"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">
              Đóng
            </button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-auto bg-bg-soft/60 p-4">
          {loading && !logs ? (
            <div className="flex items-center justify-center py-10 text-sm text-ink-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Đang chờ agent trả logs (tối đa 60s)…
            </div>
          ) : err ? (
            <p className="text-sm text-danger">{err}</p>
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-ink">
              {logs || '(no output)'}
            </pre>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
