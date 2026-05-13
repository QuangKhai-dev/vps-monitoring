'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight, PlusCircle, RefreshCw, Search } from 'lucide-react';
import { StatusDot } from '@/components/StatusDot';
import { OsBadge } from '@/components/OsBadge';
import { UsageBar } from '@/components/UsageBar';
import { ServerActions } from '@/components/ServerActions';
import { formatBytes, percent, timeAgo } from '@/lib/utils';

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
  } | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ServersClient() {
  const { data, isLoading, mutate } = useSWR<{ agents: AgentSummary[] }>(
    '/api/agents',
    fetcher,
    { refreshInterval: 5000 }
  );
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');

  const agents = (data?.agents ?? []).filter((a) => {
    if (filter === 'online' && !a.online) return false;
    if (filter === 'offline' && a.online) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (
      a.hostname.toLowerCase().includes(s) ||
      a.label?.toLowerCase().includes(s) ||
      a.os.toLowerCase().includes(s) ||
      a.publicIp?.toLowerCase().includes(s) ||
      a.agentId.toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Servers</h1>
          <p className="mt-1 text-sm text-ink-muted">All VPS connected to this dashboard.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => mutate()} className="btn-secondary">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Link href="/servers/add" className="btn-primary">
            <PlusCircle className="h-4 w-4" />
            Add server
          </Link>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              className="input pl-9"
              placeholder="Search by hostname, IP, OS…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-bg-muted p-1 text-xs">
            {(['all', 'online', 'offline'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 capitalize transition-colors ${
                  filter === f ? 'bg-bg-card text-ink shadow' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-14 w-full" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-ink-muted">No servers match this filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-bg-soft/40 text-left text-[11px] uppercase tracking-wider text-ink-soft">
                <tr>
                  <th className="px-5 py-3 font-medium">Host</th>
                  <th className="px-3 py-3 font-medium">OS</th>
                  <th className="px-3 py-3 font-medium">IP</th>
                  <th className="px-3 py-3 font-medium">CPU</th>
                  <th className="px-3 py-3 font-medium">RAM</th>
                  <th className="px-3 py-3 font-medium">Disk</th>
                  <th className="px-3 py-3 font-medium">Last seen</th>
                  <th className="px-3 py-3 text-center font-medium">Actions</th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agents.map((a) => {
                  const cpu = a.latest?.cpuPercent ?? 0;
                  const memPct = percent(
                    a.latest?.memUsedBytes ?? 0,
                    a.latest?.memTotalBytes ?? a.totalMemoryBytes
                  );
                  const diskPct = percent(
                    a.latest?.diskUsedBytes ?? 0,
                    a.latest?.diskTotalBytes ?? a.totalDiskBytes
                  );
                  return (
                    <tr
                      key={a.agentId}
                      className="group transition-colors hover:bg-bg-soft/40"
                    >
                      <td className="px-5 py-3">
                        <Link
                          href={`/servers/${a.agentId}`}
                          className="flex items-center gap-2.5"
                        >
                          <StatusDot online={a.online} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">
                              {a.label || a.hostname}
                            </div>
                            <div className="truncate text-[11px] text-ink-soft">
                              {a.cpuCores} CPU · {formatBytes(a.totalMemoryBytes)} RAM
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <OsBadge os={a.os} version={a.osVersion} />
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-ink-muted">
                        {a.publicIp ?? '—'}
                      </td>
                      <td className="w-32 px-3 py-3">
                        <UsageBar value={cpu} hint={`${cpu.toFixed(0)}%`} />
                      </td>
                      <td className="w-32 px-3 py-3">
                        <UsageBar value={memPct} hint={`${memPct.toFixed(0)}%`} />
                      </td>
                      <td className="w-32 px-3 py-3">
                        <UsageBar value={diskPct} hint={`${diskPct.toFixed(0)}%`} />
                      </td>
                      <td className="px-3 py-3 text-xs text-ink-muted">
                        {a.online ? (
                          <span className="text-success">live</span>
                        ) : (
                          timeAgo(a.lastSeenAt)
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-center">
                          <ServerActions
                            agentId={a.agentId}
                            label={a.label}
                            hostname={a.hostname}
                            onDone={() => mutate()}
                            size="sm"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/servers/${a.agentId}`}
                          className="inline-flex items-center text-ink-soft transition-colors group-hover:text-ink"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
