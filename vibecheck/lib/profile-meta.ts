import type { ProfileContext, ProfileRow, ProfileVisibility } from "@/lib/supabase/types";

export const CONTEXT_LABEL: Record<ProfileContext, string> = {
  dating: "Dating",
  friendship: "Friendship",
  get_to_know: "Getting to know me",
};

export const CONTEXT_COVER_TEXT: Record<ProfileContext, string> = {
  dating: "DATING",
  friendship: "FRIENDSHIP",
  get_to_know: "GETTING TO KNOW ME",
};

// Red/pink/green cover language, keyed off the real `context` enum instead
// of a free per-profile color field (the schema has no such field). Colors
// match the context-picker's icon colors: dating=red, friendship=pink,
// get_to_know=green — corrected from an earlier guess that had
// friendship/get_to_know swapped, before the picker reference existed.
export const CONTEXT_COVER_CLASS: Record<ProfileContext, string> = {
  dating: "bg-gradient-to-br from-[#FF6961] to-[#7D0B0E] text-[#170303]",
  friendship: "bg-gradient-to-br from-[#FF96C3] to-[#87435E] text-[#1A0A10]",
  get_to_know: "bg-gradient-to-br from-[#8FE3B0] to-[#06251C] text-[#F4FBF6]",
};

export const VISIBILITY_COPY: Record<ProfileVisibility, { label: string; description: string }> = {
  public: {
    label: "Public",
    description: "Anyone with the link can view it, and it can appear in search engines.",
  },
  unlisted: {
    label: "Unlisted",
    description: "Anyone with the link can view it, but it won't be searchable or listed anywhere.",
  },
  private: {
    label: "Private",
    description: "Only you can view it. The link stops working for everyone else.",
  },
};

// The primary profile lives at /@<username>; any other profile for the same
// user is addressed as /@<username>/<slug>, since a user has one @username
// but can hold several profiles. The prototype only ever showed the primary
// form — this nested form for secondary profiles is an assumption filling a
// gap the schema doesn't resolve on its own.
export function profilePath(
  username: string,
  profile: Pick<ProfileRow, "slug" | "is_primary">,
) {
  return profile.is_primary ? `/@${username}` : `/@${username}/${profile.slug}`;
}

export function profileUrl(username: string, profile: Pick<ProfileRow, "slug" | "is_primary">) {
  return `vibecheck.app${profilePath(username, profile)}`;
}
