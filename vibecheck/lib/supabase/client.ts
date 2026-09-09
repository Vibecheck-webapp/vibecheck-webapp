// Supabase client for use in Client Components ("use client" files).
// Import from "@/lib/supabase/client" and call createClient() inside the component.
// Do not use this in Server Components, Server Actions, or Route Handlers — use lib/supabase/server.ts there.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
