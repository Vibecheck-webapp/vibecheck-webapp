import type { ProfileContext } from "@/lib/supabase/types";

export type DraftTurnStatus = "answered" | "skipped_for_now" | "excluded";

export interface DraftTurn {
  question: string;
  answer: string | null;
  status: DraftTurnStatus;
  quickReplies?: string[];
}

// One slide of the eventual StoryViewer story. `answer` is what actually
// renders and may be user-edited on the summary review screen;
// `originalAnswer` is the user's raw, unedited answer, kept so "Use my
// original words" can always restore it. `source_index` is this slide's
// index in the GuestDraft.conversation it came from — a later step maps
// slides -> StorySlide[] (for StoryViewer) and, on real submission, to
// profiles.prompts.
export interface DraftSlide {
  question: string;
  answer: string;
  originalAnswer: string;
  source_index: number;
}

// The AI-generated (and then user-reviewed/edited) story built from a
// finished conversation. `sourceConversation` is a snapshot of
// GuestDraft.conversation at generation time, kept only so the summary page
// can tell whether the conversation has since changed and the "regenerate"
// prompt is warranted, rather than silently re-calling the API on every
// refresh.
export interface DraftSummary {
  name: string | null;
  headline: string;
  bio: string;
  vibe_tags: string[];
  interests: string[];
  slides: DraftSlide[];
  sourceConversation: DraftTurn[];
  generatedAt: string;
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
//
// summary: null until /create/summary generates it. Once real accounts
// exist, this is where a later step reads the reviewed/edited name,
// headline, bio, tags, interests, and slides from — the flat
// headline/bio/vibe_tags/interests fields below predate this and are
// currently unused placeholders from before the summarization step existed.
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
  summary: DraftSummary | null;
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
    summary: null,
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

// The single predicate for "is this draft finished enough to preview" —
// shared by /create/preview's own access guard and the home page's CTA, so
// the two can never disagree about what counts as a finished vibe. A draft
// can never satisfy this while also being an under-18 dating draft: that
// case is blocked in the builder before a second (non-scripted) answer is
// even possible, so /create/summary's own guard (which requires at least 2
// usable answers) already keeps such a draft from ever getting a summary.
export function hasFinishedDraft(draft: GuestDraft | null): boolean {
  return !!draft && !!draft.summary && !!draft.summary.name?.trim() && draft.summary.slides.length >= 2;
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
