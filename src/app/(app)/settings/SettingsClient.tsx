'use client';

import useSWR from 'swr';
import { useEffect, useState } from 'react';
import {
  Boxes,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Monitor,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AlertSettingsResponse = {
  botTokenConfigured: boolean;
  telegramChatId: string;
  alertCpuPercent: number;
  alertRamPercent: number;
  alertDiskPercent: number;
  telegramCooldownSeconds: number;
  containerMetricsRetentionDays: number;
  containerMetricsIntervalSeconds: number;
  containerControlEnabled: boolean;
  shellCommandEnabled: boolean;
};

export function SettingsClient({
  appUrl,
  offlineAfterSeconds,
}: {
  appUrl: string;
  offlineAfterSeconds: number;
}) {
  const { data } = useSWR<{ user: { username: string } | null }>('/api/auth/me', fetcher);
  const {
    data: alertData,
    error: alertError,
    isLoading: alertLoading,
    mutate: mutateAlerts,
  } = useSWR<AlertSettingsResponse>('/api/settings/alerts', fetcher);

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const [chatId, setChatId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [clearBotToken, setClearBotToken] = useState(false);
  const [cpu, setCpu] = useState('85');
  const [ram, setRam] = useState('85');
  const [disk, setDisk] = useState('90');
  const [cooldown, setCooldown] = useState('300');
  const [alertsHydrated, setAlertsHydrated] = useState(false);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [testing, setTesting] = useState(false);

  const [containerRetention, setContainerRetention] = useState('7');
  const [containerInterval, setContainerInterval] = useState('30');
  const [containerControlEnabled, setContainerControlEnabled] = useState(true);
  const [shellCommandEnabled, setShellCommandEnabled] = useState(false);
  const [savingDocker, setSavingDocker] = useState(false);

  useEffect(() => {
    if (!alertData || alertsHydrated) return;
    setChatId(alertData.telegramChatId);
    setCpu(String(alertData.alertCpuPercent));
    setRam(String(alertData.alertRamPercent));
    setDisk(String(alertData.alertDiskPercent));
    setCooldown(String(alertData.telegramCooldownSeconds));
    setContainerRetention(String(alertData.containerMetricsRetentionDays ?? 7));
    setContainerInterval(String(alertData.containerMetricsIntervalSeconds ?? 30));
    setContainerControlEnabled(alertData.containerControlEnabled !== false);
    setShellCommandEnabled(alertData.shellCommandEnabled === true);
    setAlertsHydrated(true);
  }, [alertData, alertsHydrated]);

  const copy = async () => {
    await navigator.clipboard.writeText(appUrl);
    setCopied(true);
    toast.success('Copied');
    setTimeout(() => setCopied(false), 1500);
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPwd.length < 8) return toast.error('New password must be at least 8 chars.');
    if (newPwd !== confirmPwd) return toast.error('Passwords do not match.');
    setSaving(true);
    const res = await fetch('/api/auth/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
    });
    const out = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return toast.error(out.error ?? 'Failed');
    toast.success('Password updated');
    setOldPwd('');
    setNewPwd('');
    setConfirmPwd('');
  };

  const saveAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    const nCpu = Math.round(Number(cpu));
    const nRam = Math.round(Number(ram));
    const nDisk = Math.round(Number(disk));
    const nCd = Math.round(Number(cooldown));
    if (!Number.isFinite(nCpu) || nCpu < 1 || nCpu > 100) {
      return toast.error('CPU: nhập số từ 1 đến 100.');
    }
    if (!Number.isFinite(nRam) || nRam < 1 || nRam > 100) {
      return toast.error('RAM: nhập số từ 1 đến 100.');
    }
    if (!Number.isFinite(nDisk) || nDisk < 1 || nDisk > 100) {
      return toast.error('Disk: nhập số từ 1 đến 100.');
    }
    if (!Number.isFinite(nCd) || nCd < 60 || nCd > 86_400) {
      return toast.error('Cooldown: từ 60 đến 86400 giây.');
    }

    const body: Record<string, unknown> = {
      telegramChatId: chatId,
      alertCpuPercent: nCpu,
      alertRamPercent: nRam,
      alertDiskPercent: nDisk,
      telegramCooldownSeconds: nCd,
    };
    const trimmed = botToken.trim();
    if (trimmed) body.telegramBotToken = trimmed;
    if (clearBotToken) body.clearTelegramBotToken = true;

    setSavingAlerts(true);
    const res = await fetch('/api/settings/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    setSavingAlerts(false);
    if (!res.ok) {
      return toast.error(out.error ?? 'Không lưu được');
    }
    mutateAlerts(out, false);
    setChatId(out.telegramChatId);
    setCpu(String(out.alertCpuPercent));
    setRam(String(out.alertRamPercent));
    setDisk(String(out.alertDiskPercent));
    setCooldown(String(out.telegramCooldownSeconds));
    setBotToken('');
    setClearBotToken(false);
    toast.success('Đã lưu cấu hình Telegram');
  };

  const saveDocker = async (e: React.FormEvent) => {
    e.preventDefault();
    const days = Math.round(Number(containerRetention));
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      return toast.error('Retention: nhập số từ 1 đến 90 ngày.');
    }
    setSavingDocker(true);
    const res = await fetch('/api/settings/alerts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        containerMetricsRetentionDays: days,
        containerControlEnabled,
        shellCommandEnabled,
      }),
    });
    const out = await res.json().catch(() => ({}));
    setSavingDocker(false);
    if (!res.ok) {
      return toast.error(out.error ?? 'Không lưu được');
    }
    mutateAlerts(out, false);
    toast.success('Đã lưu cấu hình Docker');
  };

  const sendTest = async () => {
    setTesting(true);
    const res = await fetch('/api/settings/alerts/test', { method: 'POST' });
    const out = await res.json().catch(() => ({}));
    setTesting(false);
    if (!res.ok) return toast.error(out.error ?? 'Gửi thử thất bại');
    toast.success('Đã gửi tin thử — kiểm tra Telegram');
  };

  const configured =
    alertData?.botTokenConfigured && (alertData.telegramChatId?.trim() ?? '').length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">Manage your admin account and dashboard.</p>
      </div>

      <div className="card card-pad">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Monitor className="h-4 w-4 text-ink-muted" />
          Appearance
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Light or dark interface. Your choice is saved in this browser.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-soft">Theme</span>
          <ThemeToggle className="border border-border bg-bg-muted" />
        </div>
      </div>

      <div className="card card-pad">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <ShieldCheck className="h-4 w-4 text-success" />
          Account
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Row label="Username" value={data?.user?.username ?? '—'} />
          <Row label="Role" value="Administrator" />
          <Row label="Public sign-ups" value={<span className="chip-muted">Disabled</span>} />
        </dl>
      </div>

      <form onSubmit={changePassword} className="card card-pad">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <KeyRound className="h-4 w-4 text-ink-muted" />
          Change password
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="label">Current password</label>
            <input
              type="password"
              className="input"
              value={oldPwd}
              onChange={(e) => setOldPwd(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              type="password"
              className="input"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input
              type="password"
              className="input"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              minLength={8}
              required
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="mt-4">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </div>
      </form>

      <form onSubmit={saveAlerts} className="card card-pad">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Send className="h-4 w-4 text-ink-muted" />
          Telegram — cảnh báo quá tải
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Khi CPU, RAM hoặc dung lượng ổ đĩa (/) vượt ngưỡng, dashboard gửi một tin qua Telegram. Cấu hình
          được lưu trong PostgreSQL (không dùng biến môi trường cho token hay ngưỡng).
        </p>

        {alertLoading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải cấu hình…
          </div>
        )}
        {alertError && (
          <p className="mt-4 text-sm text-danger">Không tải được cấu hình (đăng nhập lại hoặc kiểm tra API).</p>
        )}

        {!alertLoading && alertData && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink-soft">Trạng thái:</span>
              {configured ? (
                <span className="chip-success">Đã bật (bot + chat id)</span>
              ) : (
                <span className="chip-muted">Chưa đủ bot token + chat id</span>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="label">Bot token (@BotFather)</label>
                <input
                  type="password"
                  className="input font-mono text-sm"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={alertData.botTokenConfigured ? '•••• để giữ token hiện tại — nhập mới để thay' : '123456789:ABC...'}
                  autoComplete="off"
                />
                {alertData.botTokenConfigured && (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
                    <input
                      type="checkbox"
                      checked={clearBotToken}
                      onChange={(e) => setClearBotToken(e.target.checked)}
                    />
                    Xóa token đã lưu (sau khi bấm Lưu)
                  </label>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="label">Chat ID (user hoặc nhóm)</label>
                <input
                  className="input font-mono text-sm"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="-100… hoặc số user id"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label">Cảnh báo khi CPU ≥ (%)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  value={cpu}
                  onChange={(e) => setCpu(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Cảnh báo khi RAM ≥ (%)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  value={ram}
                  onChange={(e) => setRam(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Cảnh báo khi disk / ≥ (%)</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={100}
                  value={disk}
                  onChange={(e) => setDisk(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Cooldown (giây / mỗi máy)</label>
                <input
                  className="input"
                  type="number"
                  min={60}
                  max={86400}
                  value={cooldown}
                  onChange={(e) => setCooldown(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-ink-soft">Tối thiểu 60, tối đa 86400.</p>
              </div>
            </div>

            <p className="mt-4 text-xs text-ink-soft">
              Bot token được lưu trong cùng database với dashboard — chỉ phù hợp khi bạn kiểm soát được PostgreSQL
              và máy chủ ứng dụng.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={savingAlerts}>
                {savingAlerts && <Loader2 className="h-4 w-4 animate-spin" />}
                Lưu cấu hình
              </button>
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-2"
                disabled={testing || !configured}
                onClick={sendTest}
                title={!configured ? 'Cần bot token + chat id đã lưu' : undefined}
              >
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Gửi tin thử
              </button>
            </div>
          </>
        )}
      </form>

      <form onSubmit={saveDocker} className="card card-pad">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Boxes className="h-4 w-4 text-ink-muted" />
          Docker monitoring
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Mỗi VPS có Docker socket sẽ gửi danh sách container và thống kê CPU/RAM. Bạn có thể
          giới hạn thời gian lưu lịch sử và tạm tắt tính năng điều khiển container.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="label">Giữ lịch sử (ngày)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={90}
              value={containerRetention}
              onChange={(e) => setContainerRetention(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-ink-soft">
              Tự dọn dẹp mỗi ngày 03:00. Dữ liệu container_metrics cũ hơn sẽ bị xoá.
            </p>
          </div>
          <div>
            <label className="label">Tần suất agent (giây)</label>
            <input
              className="input"
              type="number"
              value={containerInterval}
              disabled
            />
            <p className="mt-1 text-[11px] text-ink-soft">
              Hiện đang chạy theo INTERVAL của agent (mặc định 15s). Đổi tần suất cần re-install
              agent bằng query <code>?interval=</code>.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={containerControlEnabled}
                onChange={(e) => setContainerControlEnabled(e.target.checked)}
              />
              Cho phép điều khiển container (Start / Stop / Restart) từ dashboard
            </label>
            <p className="mt-1 text-[11px] text-ink-soft">
              Khi tắt, API <code>action</code> trả 403. Logs vẫn xem được.
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shellCommandEnabled}
                onChange={(e) => setShellCommandEnabled(e.target.checked)}
              />
              Cho phép chạy lệnh terminal từ dashboard
            </label>
            <p className="mt-1 text-[11px] text-ink-soft">
              Tính năng này chạy lệnh bằng agent trên VPS. Mặc định tắt; chỉ bật khi bạn tin tưởng
              người có quyền đăng nhập dashboard.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <button type="submit" className="btn-primary" disabled={savingDocker}>
            {savingDocker && <Loader2 className="h-4 w-4 animate-spin" />}
            Lưu cấu hình
          </button>
        </div>
      </form>

      <div className="card card-pad">
        <h2 className="text-base font-semibold text-ink">Dashboard</h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-ink-soft">App URL</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="truncate font-mono text-ink">{appUrl}</code>
              <button
                type="button"
                onClick={copy}
                className="rounded-md p-1.5 text-ink-soft hover:bg-bg-muted hover:text-ink"
              >
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </button>
            </dd>
            <p className="mt-1 text-[11px] text-ink-soft">
              Set via <code>NEXT_PUBLIC_APP_URL</code> in your environment.
            </p>
          </div>
          <Row
            label="Offline threshold"
            value={`${offlineAfterSeconds}s without heartbeat`}
          />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="truncate text-ink">{value}</dd>
    </div>
  );
}
