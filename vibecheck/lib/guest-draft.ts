import type { ProfileContext } from "@/lib/supabase/types";

export type DraftTurnStatus = "answered" | "skipped_for_now" | "excluded";

export interface DraftTurn {
  question: string;
  answer: string | null;
  status: DraftTurnStatus;
  quickReplies?: string[];
}

// Shaped to map cleanly onto a future `profiles` insert: `context` is used
// directly, and `conversation` is the raw material for headline/bio/
// vibe_tags/interests — that extraction is a deliberately separate
// summarization step (see app/create/build's done-state), not done here.
//
// photoDataUrl: once a real account exists (a later task, after auth),
// decode this back into a Blob and upload it to Supabase Storage (the
// avatars/covers buckets), then clear this field — it should never reach
// the database as a data URL. It's also never actually stored alongside
// the rest of this object; see the STORAGE_KEY / PHOTO_STORAGE_KEY split
// below.
export interface GuestDraft {
  version: 1;
  context: ProfileContext;
  startedAt: string;
  updatedAt: string;
  conversation: DraftTurn[];
  headline: string | null;
  bio: string | null;
  vibe_tags: string[];
  interests: string[];
  photoDataUrl: string | null;
}

const STORAGE_KEY = "vibecheck:guest-draft:v1";
// A face photo shouldn't linger indefinitely on a shared device the way the
// text draft can — sessionStorage survives a refresh or in-tab navigation
// but clears the moment the tab closes, unlike localStorage.
const PHOTO_STORAGE_KEY = "vibecheck:guest-draft-photo:v1";

export function createDraft(context: ProfileContext): GuestDraft {
  const now = new Date().toISOString();
  return {
    version: 1,
    context,
    startedAt: now,
    updatedAt: now,
    conversation: [],
    headline: null,
    bio: null,
    vibe_tags: [],
    interests: [],
    photoDataUrl: null,
  };
}

export function loadDraft(): GuestDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<GuestDraft, "photoDataUrl">;
    if (parsed?.version !== 1) return null;
    let photoDataUrl: string | null = null;
    try {
      photoDataUrl = window.sessionStorage.getItem(PHOTO_STORAGE_KEY);
    } catch {
      // Ignore — photo just comes back empty.
    }
    return { ...parsed, photoDataUrl };
  } catch {
    return null;
  }
}

export function saveDraft(draft: GuestDraft) {
  if (typeof window === "undefined") return;
  const { photoDataUrl, ...rest } = draft;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // Best-effort only — private browsing / storage quota can throw.
  }
  try {
    if (photoDataUrl) {
      window.sessionStorage.setItem(PHOTO_STORAGE_KEY, photoDataUrl);
    } else {
      window.sessionStorage.removeItem(PHOTO_STORAGE_KEY);
    }
  } catch {
    // Ignore.
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
  try {
    window.sessionStorage.removeItem(PHOTO_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
