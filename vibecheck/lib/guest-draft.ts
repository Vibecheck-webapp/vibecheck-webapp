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
}

const STORAGE_KEY = "vibecheck:guest-draft:v1";

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
  };
}

export function loadDraft(): GuestDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestDraft;
    if (parsed?.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft: GuestDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Best-effort only — private browsing / storage quota can throw.
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
