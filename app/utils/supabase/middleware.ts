import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Do not run auth logic on static files
  if (pathname.includes("/_next") || pathname.includes(".")) return NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set(name, value);
          // Note: Middleware can't set cookies directly in response; this is for context
        },
        remove(name: string, options: any) {
          request.cookies.set(name, "");
        },
      },
    }
  );

  await supabase.auth.getSession();
  return NextResponse.next();
}