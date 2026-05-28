'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-bg px-6 py-16 text-ink">
      <div className="mx-auto max-w-lg text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-sm text-ink-muted">
          A server error occurred. Often this is a failed <strong className="text-ink">PostgreSQL</strong>{' '}
          connection or a missing <strong className="text-ink">JWT_SECRET</strong> in production.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-ink-soft">Digest: {error.digest}</p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => reset()} className="btn-primary">
            Try again
          </button>
          <Link href="/service-unavailable" className="btn-secondary">
            Database help
          </Link>
          <Link href="/" className="btn-ghost">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
