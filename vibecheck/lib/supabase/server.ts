// Supabase client for use in Server Components, Server Actions, and Route Handlers.
// Import from "@/lib/supabase/server" and call await createClient() — a new client per request, never shared/cached.
// Do not use this in Client Components — use lib/supabase/client.ts there.
//
// Server Components can only read cookies, not write them (Next.js restriction), so setAll
// is wrapped in a try/catch there. Writing the refreshed session cookies back to the browser
// is handled by proxy.ts, which runs on every request and can set cookies on the response.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — cookies can't be set here.
            // Safe to ignore as long as proxy.ts is refreshing the session.
          }
        },
      },
    },
  );
}
