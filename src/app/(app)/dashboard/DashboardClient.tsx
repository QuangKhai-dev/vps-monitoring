'use client';

import useSWR from 'swr';
import Link from 'next/link';
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  PlusCircle,
  RefreshCw,
  ServerCog,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { StatusDot } from '@/components/StatusDot';
import { UsageBar } from '@/components/UsageBar';
import { OsBadge } from '@/components/OsBadge';
import { ServerActions } from '@/components/ServerActions';
import { formatBps, formatBytes, formatUptime, percent, timeAgo } from '@/lib/utils';

interface AgentSummary {
  agentId: string;
  hostname: string;
  label?: string;
  os: string;
  osVersion: string;
  cpuCores: number;
  totalMemoryBytes: number;
  totalDiskBytes: number;
  publicIp?: string;
  online: boolean;
  lastSeenAt?: string;
  latest: {
    cpuPercent: number;
    memUsedBytes: number;
    memTotalBytes: number;
    diskUsedBytes: number;
    diskTotalBytes: number;
    netRxBps: number;
    netTxBps: number;
    uptimeSeconds: number;
  } | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function DashboardClient() {
  const { data, isLoading, mutate } = useSWR<{ agents: AgentSummary[] }>(
    '/api/agents',
    fetcher,
    { refreshInterval: 5000 }
  );

  const agents = data?.agents ?? [];
  const total = agents.length;
  const online = agents.filter((a) => a.online).length;
  const offline = total - online;

  const avgCpu =
    agents.reduce((acc, a) => acc + (a.latest?.cpuPercent ?? 0), 0) / Math.max(1, total);
  const totalMem = agents.reduce((acc, a) => acc + (a.totalMemoryBytes ?? 0), 0);
  const usedMem = agents.reduce((acc, a) => acc + (a.latest?.memUsedBytes ?? 0), 0);
  const totalDisk = agents.reduce((acc, a) => acc + (a.totalDiskBytes ?? 0), 0);
  const usedDisk = agents.reduce((acc, a) => acc + (a.latest?.diskUsedBytes ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Overview of every VPS reporting to this instance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => mutate()}
            className="btn-secondary"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Link href="/servers/add" className="btn-primary">
            <PlusCircle className="h-4 w-4" />
            Add server
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          icon={ServerCog}
          label="Servers"
          value={total}
          hint={`${online} online · ${offline} offline`}
          accent="brand"
        />
        <StatCard
          icon={Activity}
          label="Avg. CPU"
          value={`${avgCpu.toFixed(1)}%`}
          hint="Across all online servers"
          accent={avgCpu >= 85 ? 'danger' : avgCpu >= 65 ? 'warning' : 'success'}
        />
        <StatCard
          icon={MemoryStick}
          label="Memory used"
          value={formatBytes(usedMem)}
          hint={`of ${formatBytes(totalMem)} total`}
          accent="brand"
        />
        <StatCard
          icon={HardDrive}
          label="Disk used"
          value={formatBytes(usedDisk)}
          hint={`of ${formatBytes(totalDisk)} total`}
          accent="warning"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Servers</h2>
            <p className="text-xs text-ink-soft">
              {isLoading ? 'Loading…' : `${total} agent${total === 1 ? '' : 's'} registered`}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-20 w-full" />
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((a) => (
              <ServerCard key={a.agentId} agent={a} onUpdated={() => mutate()} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServerCard({ agent: a, onUpdated }: { agent: AgentSummary; onUpdated: () => void }) {
  const memPct = percent(a.latest?.memUsedBytes ?? 0, a.latest?.memTotalBytes ?? a.totalMemoryBytes);
  const diskPct = percent(a.latest?.diskUsedBytes ?? 0, a.latest?.diskTotalBytes ?? a.totalDiskBytes);
  const cpu = a.latest?.cpuPercent ?? 0;
  const title = a.label || a.hostname;

  return (
    <div className="group relative rounded-xl border border-border bg-bg-soft/40 p-4 transition-colors hover:border-ink-soft hover:bg-bg-card">
      <Link
        href={`/servers/${a.agentId}`}
        className="absolute inset-0 z-0 rounded-xl outline-none ring-inset focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={`Open ${title}`}
      />

      <div className="relative z-10 space-y-4 pointer-events-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot online={a.online} />
              <div className="truncate text-sm font-semibold text-ink">{title}</div>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
              <OsBadge os={a.os} version={a.osVersion} />
              {a.publicIp && <span className="font-mono">{a.publicIp}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 pointer-events-auto">
            <ServerActions
              agentId={a.agentId}
              label={a.label}
              hostname={a.hostname}
              onDone={onUpdated}
            />
            <div
              className={`chip ${
                a.online ? 'chip-success' : 'chip-muted'
              } text-[10px]`}
            >
              {a.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {a.online ? 'Online' : timeAgo(a.lastSeenAt)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <Metric icon={Cpu} value={`${cpu.toFixed(0)}%`} label="CPU" />
          <Metric icon={MemoryStick} value={`${memPct.toFixed(0)}%`} label="RAM" />
          <Metric icon={HardDrive} value={`${diskPct.toFixed(0)}%`} label="Disk" />
        </div>

        <div className="space-y-2">
          <UsageBar value={cpu} label="CPU" hint={`${cpu.toFixed(1)}%`} />
          <UsageBar
            value={memPct}
            label="Memory"
            hint={`${formatBytes(a.latest?.memUsedBytes ?? 0)} / ${formatBytes(
              a.latest?.memTotalBytes ?? a.totalMemoryBytes
            )}`}
          />
          <UsageBar
            value={diskPct}
            label="Disk"
            hint={`${formatBytes(a.latest?.diskUsedBytes ?? 0)} / ${formatBytes(
              a.latest?.diskTotalBytes ?? a.totalDiskBytes
            )}`}
          />
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3 text-[11px] text-ink-soft">
          <span>↓ {formatBps(a.latest?.netRxBps ?? 0)}</span>
          <span>↑ {formatBps(a.latest?.netTxBps ?? 0)}</span>
          <span>up {formatUptime(a.latest?.uptimeSeconds ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Cpu;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-lg bg-bg-muted/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-ink-soft">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-0.5 font-semibold text-ink">{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-bg-muted text-ink-muted">
        <ServerCog className="h-7 w-7" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-ink">No servers yet</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">
        Install the agent on a VPS and it will appear here automatically. No manual registration
        needed.
      </p>
      <Link href="/servers/add" className="btn-primary mt-5">
        <PlusCircle className="h-4 w-4" />
        Add your first server
      </Link>
    </div>
  );
}
