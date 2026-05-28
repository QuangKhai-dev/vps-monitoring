import Link from 'next/link';
import { Database, RefreshCw } from 'lucide-react';

export const metadata = {
  title: 'Database unavailable — VPS Monitor',
};

export default function ServiceUnavailablePage() {
  return (
    <main className="min-h-screen bg-bg px-6 py-16 text-ink">
      <div className="mx-auto max-w-lg">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-bg-muted">
          <Database className="h-6 w-6 text-ink-muted" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Cannot reach PostgreSQL</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          The app could not connect to the database. This is the most common issue right after
          deploy. Fix the connection, then try again.
        </p>

        <ul className="mt-6 space-y-3 text-sm text-ink-muted">
          <li>
            <strong className="text-ink">Docker Compose (root):</strong> set{' '}
            <code className="font-mono text-xs">DB_HOST=postgres</code>,{' '}
            <code className="font-mono text-xs">DB_NAME=vps_monitoring</code>, và user/password khớp
            service <code className="font-mono text-xs">postgres</code>.
          </li>
          <li>
            <strong className="text-ink">PostgreSQL ngoài (VPS):</strong> dùng IP/host thật, mở port{' '}
            <code className="font-mono text-xs">5432</code>, tạo database{' '}
            <code className="font-mono text-xs">vps_monitoring</code> (khuyến nghị tách khỏi app khác).
          </li>
          <li>
            <strong className="text-ink">Trong container:</strong> không dùng{' '}
            <code className="font-mono text-xs">localhost</code> cho DB trên host — dùng tên service hoặc{' '}
            <code className="font-mono text-xs">host.docker.internal</code>.
          </li>
          <li>
            <strong className="text-ink">Secrets:</strong> ensure <code className="font-mono text-xs">JWT_SECRET</code>{' '}
            is set in production (see <code className="font-mono text-xs">.env.example</code>).
          </li>
        </ul>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn-primary inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Link>
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          Quick check: open{' '}
          <a href="/api/health/db" className="text-ink-muted underline hover:text-ink">
            /api/health/db
          </a>{' '}
          — JSON shows the PostgreSQL error (passwords redacted). On the server, run:{' '}
          <code className="font-mono">docker compose logs vps-monitoring</code> for full logs.
        </p>
      </div>
    </main>
  );
}
