import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Only refresh Supabase session if env vars are configured
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const { updateSession } = await import('@/lib/supabase/middleware')
    return await updateSession(request)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)',
  ],
}
