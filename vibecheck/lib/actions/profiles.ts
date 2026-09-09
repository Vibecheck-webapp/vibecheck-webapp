"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProfileVisibility } from "@/lib/supabase/types";

export async function updateProfileVisibility(
  profileId: string,
  visibility: ProfileVisibility,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You must be signed in to do that.");
  }

  // RLS already scopes updates to auth.uid() = user_id, but filtering here
  // too keeps the query's intent explicit and avoids silently no-op'ing on
  // someone else's profile id.
  const { error } = await supabase
    .from("profiles")
    .update({ visibility })
    .eq("id", profileId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
}

export async function deleteProfile(profileId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("You must be signed in to do that.");
  }

  const { error } = await supabase
    .from("profiles")
    .delete()
    .eq("id", profileId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
}
