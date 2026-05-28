import { redirect } from 'next/navigation';
import { isSetupComplete } from '@/lib/setup';
import { SetupForm } from './SetupForm';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ShieldCheck, Server, LineChart } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (await isSetupComplete()) {
    redirect('/login');
  }

  return (
    <main className="relative min-h-screen">
      <div className="fixed right-4 top-4 z-50">
        <ThemeToggle className="bg-bg-card/90 border border-border shadow-card" />
      </div>
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-2">
        <div className="space-y-8">
          <Logo />
          <div className="space-y-4">
            <span className="chip-muted">First-time setup</span>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Create your administrator account.
            </h1>
            <p className="max-w-md text-ink-muted">
              VPS Monitor doesn't support public registration. The first account you create is the
              only admin. Use a strong password — you can change it later.
            </p>
          </div>

          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3 text-ink-muted">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <span>Self-hosted, your data stays on your PostgreSQL.</span>
            </li>
            <li className="flex items-start gap-3 text-ink-muted">
              <Server className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
              <span>One-line installer for Ubuntu, Debian, CentOS, Rocky, Alma, and more.</span>
            </li>
            <li className="flex items-start gap-3 text-ink-muted">
              <LineChart className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <span>Live CPU, memory, disk, network and uptime in a single dashboard.</span>
            </li>
          </ul>
        </div>

        <div className="card card-pad animate-fade-in">
          <SetupForm />
        </div>
      </div>
    </main>
  );
}
