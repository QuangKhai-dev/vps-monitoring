import { NextResponse } from 'next/server';
import { connectDB, pingDatabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeErr(err: unknown): { name: string; code?: string; message: string } {
  if (!err || typeof err !== 'object') {
    return { name: 'Error', message: 'Unknown error' };
  }
  const e = err as { name?: string; message?: string; code?: string };
  let msg = String(e.message ?? 'error');
  msg = msg.replace(/\/\/([^:@/]+):([^@/]+)@/g, '//***:***@');
  return {
    name: String(e.name ?? 'Error'),
    code: typeof e.code === 'string' ? e.code : undefined,
    message: msg.slice(0, 800),
  };
}

export async function GET() {
  try {
    await connectDB();
    const { database } = await pingDatabase();
    return NextResponse.json({
      ok: true,
      database,
    });
  } catch (err) {
    const s = safeErr(err);
    const authHint =
      /password authentication failed|invalid authorization/i.test(s.message)
        ? 'Kiểm tra DB_USER / DB_PASSWORD (hoặc DATABASE_URL) khớp với PostgreSQL.'
        : /does not exist/i.test(s.message)
          ? 'Database chưa tồn tại — tạo DB (ví dụ vps_monitoring) hoặc sửa DB_NAME.'
          : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: s,
        hint: authHint,
      },
      { status: 503 }
    );
  }
}
