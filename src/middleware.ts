import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'nb_admin_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard /admin routes
  if (!pathname.startsWith('/admin')) return NextResponse.next();

  // Allow the login page through always
  if (pathname === '/admin/login') {
    // If already authenticated, redirect to admin
    const session = request.cookies.get(SESSION_COOKIE)?.value;
    if (session === process.env.ADMIN_SESSION_SECRET) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    return NextResponse.next();
  }

  // Check session cookie
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session !== process.env.ADMIN_SESSION_SECRET) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
