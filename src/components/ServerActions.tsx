'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export function ServerActions({
  agentId,
  label,
  hostname,
  onDone,
  size = 'md',
}: {
  agentId: string;
  label?: string;
  hostname: string;
  onDone: () => void;
  size?: 'sm' | 'md';
}) {
  const display = (label?.trim() || hostname).slice(0, 64);
  const pad = size === 'sm' ? 'p-1' : 'p-1.5';
  const icon = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  const rename = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = window.prompt('Tên hiển thị (để trống = dùng hostname):', label ?? hostname);
    if (next === null) return;
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: next.trim() }),
    });
    if (!res.ok) {
      toast.error('Không đổi được tên');
      return;
    }
    toast.success('Đã cập nhật tên');
    onDone();
  };

  const remove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `Xóa server "${display}" và toàn bộ metrics?\nHành động này không thể hoàn tác.`
      )
    ) {
      return;
    }
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Xóa thất bại');
      return;
    }
    toast.success('Đã xóa server');
    onDone();
  };

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`rounded-md ${pad} text-ink-soft transition-colors hover:bg-bg-muted hover:text-ink`}
        title="Đổi tên"
        onClick={rename}
      >
        <Pencil className={icon} />
      </button>
      <button
        type="button"
        className={`rounded-md ${pad} text-ink-soft transition-colors hover:bg-bg-muted hover:text-danger`}
        title="Xóa server"
        onClick={remove}
      >
        <Trash2 className={icon} />
      </button>
    </div>
  );
}
