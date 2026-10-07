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
// profiles.prompts. `null` means the slide was typed directly on the
// summary review screen via "Add an answer" rather than produced by the
// AI from a conversation turn — see /create/summary's add-answer control.
export interface DraftSlide {
  question: string;
  answer: string;
  originalAnswer: string;
  source_index: number | null;
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
  // The model's own running snapshot of what it's already extracted from the
  // conversation, echoed back to it on every generate-question call so it
  // can decide what's still missing without re-reading the whole transcript.
  // All three contexts keep their "slide: …" entries here (the shared
  // content-based stopping rule, see builder-constants); friendship and
  // get_to_know also keep attribute labels like "personality: introvert"
  // and "tried: <beat>" entries.
  extractedAttributes: string[];
  // Dating only: set once the scripted age question gets an under-18 reply.
  // Persisted (not just live React state in BuilderView) so the block
  // survives a hard reload instead of silently resetting — read via
  // isAgeBlocked() below, the one source of truth every guarded step
  // (the builder itself, /create/photo, /create/summary, /create/preview)
  // checks, rather than each re-deriving it from the raw scripted answer.
  // Clears only by starting a fresh draft (switching vibe type, or the
  // home page's explicit "Start a new Vibecheck").
  ageBlocked: boolean;
}

const STORAGE_KEY = "vibecheck:guest-draft:v1";
// A face photo shouldn't linger indefinitely on a shared device the way the
// text draft can — sessionStorage survives a refresh or in-tab navigation
// but clears the moment the tab closes, unlike localStorage.
const PHOTO_STORAGE_KEY = "vibecheck:guest-draft-photo:v1";

export function createDraft(context: ProfileContext): GuestDraft {
  const now = new Date().toISOString();
  // A photo already picked for this browser session's in-progress vibe
  // isn't conversation-specific — carries forward into a fresh draft (e.g.
  // after switching vibe type mid-builder, see clearDraftConversation
  // below) so it only ever disappears via an explicit clearDraft().
  let photoDataUrl: string | null = null;
  if (typeof window !== "undefined") {
    try {
      photoDataUrl = window.sessionStorage.getItem(PHOTO_STORAGE_KEY);
    } catch {
      // Ignore — starts with no photo.
    }
  }
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
    photoDataUrl,
    summary: null,
    extractedAttributes: [],
    ageBlocked: false,
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
    // A draft saved before extractedAttributes/ageBlocked existed simply
    // won't have them.
    return {
      ...parsed,
      extractedAttributes: parsed.extractedAttributes ?? [],
      ageBlocked: parsed.ageBlocked ?? false,
      photoDataUrl,
    };
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

// The one place every guarded step (the builder itself, /create/photo,
// /create/summary, /create/preview) checks for the under-18 dating block —
// see GuestDraft.ageBlocked above.
export function isAgeBlocked(draft: GuestDraft | null): boolean {
  return !!draft?.ageBlocked;
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

// Clears only the stored conversation draft — deliberately leaves any
// already-picked photo in sessionStorage alone, since createDraft() picks
// it back up for whichever context gets chosen next. Used when backing out
// to the context picker mid-builder to switch vibe type (conversation,
// age-gate flag and extracted info should reset; the photo and
// draft.summary, which this never touches, should not). clearDraft() above
// is the one that wipes everything, including the photo, for an explicit
// "start over" action.
export function clearDraftConversation() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
