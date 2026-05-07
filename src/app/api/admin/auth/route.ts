import { NextRequest, NextResponse } from 'next/server';

const COOKIE = 'nb_admin_session';
const MAX_AGE = 60 * 60 * 8; // 8 hours

/** POST /api/admin/auth — login */
export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return NextResponse.json(
      { error: 'Server not configured. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in env.' },
      { status: 500 }
    );
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE, process.env.ADMIN_SESSION_SECRET, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}

/** DELETE /api/admin/auth — logout */
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE, '', { maxAge: 0, path: '/' });
  return res;
}
