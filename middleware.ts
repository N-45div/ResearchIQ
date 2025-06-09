import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
    // Get the pathname
    const path = req.nextUrl.pathname

    // Redirect auth pages to home page
    if (path.startsWith('/auth')) {
        return NextResponse.redirect(new URL('/', req.url))
    }

    // Continue with the request
    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)', '/auth/:path*']
}; 