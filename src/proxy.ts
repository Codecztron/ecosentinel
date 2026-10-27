import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isSupabaseConfigured } from "@/lib/config";

/**
 * Refreshes Supabase sessions before requests reach the dashboard. Next.js 16
 * uses the `proxy` convention for this request lifecycle hook.
 */
export async function proxy(request: NextRequest) {
  // No backend configured (local/demo dev) — skip Supabase entirely rather
  // than let createServerClient throw on missing environment variables.
  if (!isSupabaseConfigured) {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - image/font files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
