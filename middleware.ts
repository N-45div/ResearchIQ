import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Initialize Redis client
const redisUrl = process.env.UPSTASH_REDIS_REST_URL!;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN!;
const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

const ANONYMOUS_LIMIT = 3;
const LOGGED_IN_LIMIT = 10;
const TARGET_ROUTES = ['/api/langchain-agent', '/api/multi-agent', '/api/reasoning-agent', '/api/research'];
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

export async function middleware(req: NextRequest) {
    const path = req.nextUrl.pathname;

    // Apply rate limiting to target routes
    if (TARGET_ROUTES.includes(path)) {
        let userId = '';
        let limit = ANONYMOUS_LIMIT;

        // Try to get user ID from Supabase auth
        const cookie = req.cookies.get('supabase-auth-token'); // Varies based on your auth setup
        if (cookie) {
            try {
                const { data: { user }, error } = await supabase.auth.getUser(JSON.parse(cookie.value).access_token);
                if (user && !error) {
                    userId = user.id;
                    limit = LOGGED_IN_LIMIT;
                } else if (error) {
                    console.warn('Error fetching user from Supabase:', error.message);
                    // Fallback to anonymous if there's an error, but token was present
                    userId = `anonymous-${req.headers.get('x-forwarded-for') || 'unknown'}`;
                }
            } catch (e: any) {
                console.warn('Error parsing Supabase auth cookie or fetching user:', e.message);
                userId = `anonymous-${req.headers.get('x-forwarded-for') || 'unknown'}`;
            }
        } else {
            // Generate identifier for anonymous users
            userId = `anonymous-${req.headers.get('x-forwarded-for') || 'unknown'}`;
        }

        const redisKey = `request_count:${userId}`;

        try {
            let currentCount = await redis.get<number>(redisKey) || 0;

            if (currentCount >= limit) {
                return NextResponse.json({ error: 'Rate limit exceeded', isLimited: true, usageCount: currentCount, limit: limit }, { status: 429 });
            } else {
                // Increment the count and set expiry if it's a new key
                const pipeline = redis.pipeline();
                pipeline.incr(redisKey);
                if (currentCount === 0) {
                    pipeline.expire(redisKey, ONE_DAY_IN_SECONDS);
                }
                await pipeline.exec();
                return NextResponse.next();
            }
        } catch (error: any) {
            console.warn('Redis error:', error.message, 'Allowing request to pass.');
            // Fallback: If Redis is unavailable, log a warning and allow the request
            return NextResponse.next();
        }
    }

    // Existing logic: Redirect auth pages to home page
    if (path.startsWith('/auth')) {
        return NextResponse.redirect(new URL('/', req.url));
    }

    // Continue with the request for non-target routes or if rate limiting passed
    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)', '/auth/:path*', '/api/langchain-agent', '/api/multi-agent', '/api/reasoning-agent', '/api/research']
}; 