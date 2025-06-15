import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "",
});

// Create a new rate limiter with a sliding window of 3 requests per 1 hour
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, "1 h"),
});

export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  const ip = req.ip || "anonymous";
  const identifier = userId ? `rate_limit:${userId}` : `rate_limit:${ip}`;

  try {
    const { success, remaining, reset } = await ratelimit.limit(identifier);

    if (!success) {
      return NextResponse.json(
        { error: "Rate limit exceeded", remaining, reset },
        { status: 429 }
      );
    }

    return NextResponse.json({ remaining });
  } catch (error) {
    console.error(`Rate limit error at 02:30 PM IST, June 15, 2025:`, error);
    // Fallback to no rate limiting if the service is unavailable
    return NextResponse.json({ remaining: Infinity });
  }
}