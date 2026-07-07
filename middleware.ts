import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const AUTH_COOKIE = 'ga4_auth'

const INTERNAL_SECRET_HEADER = 'x-internal-secret'

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    if (pathname.startsWith('/api/auth/')) {
        return NextResponse.next()
    }
    if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
        return NextResponse.next()
    }

    const internalPostPaths = ['/api/ab-test/execute', '/api/alerts/cv-drop', '/api/reports/weekly-summary']
    if (internalPostPaths.includes(pathname) && request.method === 'POST') {
        const secret = request.headers.get(INTERNAL_SECRET_HEADER)
        if (secret && process.env.INTERNAL_API_SECRET && secret === process.env.INTERNAL_API_SECRET) {
            return NextResponse.next()
        }
    }

    const hasAuth = request.cookies.get(AUTH_COOKIE)?.value === '1'

    if (pathname === '/login') {
        if (hasAuth) {
            return NextResponse.redirect(new URL('/', request.url))
        }
        return NextResponse.next()
    }

    if (!hasAuth) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('from', pathname)
        return NextResponse.redirect(loginUrl)
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!_next/static|_next/image).*)'],
}
