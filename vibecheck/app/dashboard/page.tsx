import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, UserRow } from "@/lib/supabase/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No /login route exists yet, so unauthenticated visitors go home instead
  // of to a 404. Follow-up: point this at /login once it's built.
  if (!user) {
    redirect("/");
  }

  const [{ data: userRow, error: userError }, { data: profileRows, error: profilesError }] =
    await Promise.all([
      supabase.from("users").select("id, username, credits").eq("id", user.id).single(),
      supabase
        .from("profiles")
        .select("id, slug, context, visibility, is_primary, headline, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

  if (userError || !userRow) {
    throw new Error(userError?.message ?? "Could not load your account.");
  }
  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const account = userRow as Pick<UserRow, "id" | "username" | "credits">;
  const profiles = (profileRows ?? []) as Pick<
    ProfileRow,
    "id" | "slug" | "context" | "visibility" | "is_primary" | "headline"
  >[];

  return <DashboardView username={account.username} credits={account.credits} profiles={profiles} />;
}
