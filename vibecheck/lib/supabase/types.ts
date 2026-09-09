// Hand-written from the live Supabase schema as described by the project owner —
// there are no local migrations or generated types to source this from yet.
// Once `npx supabase gen types typescript --project-id <ref> --schema public`
// (or an MCP introspection) is runnable, replace this file with the generated
// output and delete it.

export type ProfileContext = "dating" | "get_to_know" | "friendship";
export type ProfileVisibility = "public" | "unlisted" | "private";

export const PROFILE_CONTEXTS: ProfileContext[] = ["dating", "friendship", "get_to_know"];

export function isProfileContext(value: unknown): value is ProfileContext {
  return typeof value === "string" && (PROFILE_CONTEXTS as string[]).includes(value);
}

export interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  credits: number;
  created_at: string;
  updated_at: string;
  username_changed_at: string | null;
}

export interface ProfileRow {
  id: string;
  user_id: string;
  slug: string;
  context: ProfileContext;
  visibility: ProfileVisibility;
  is_primary: boolean;
  headline: string | null;
  bio: string | null;
  location: string | null;
  cover_url: string | null;
  vibe_tags: string[];
  interests: string[];
  favorites: Record<string, unknown> | null;
  prompts: Record<string, unknown> | null;
  theme: Record<string, unknown> | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}
