"use client";

import { useEffect, useState } from "react";
import { SCRIPTED_OPENING_QUESTIONS } from "@/lib/builder-constants";
import { clearDraftConversation, loadDraft, type GuestDraft } from "@/lib/guest-draft";
import { CONTEXT_LABEL } from "@/lib/profile-meta";
import type { ProfileContext } from "@/lib/supabase/types";

const CONTEXTS: {
  context: ProfileContext;
  icon: string;
  iconWidth: number;
  iconHeight: number;
  title: string;
  description: string;
  tags: string;
  accent: string;
  blob: string;
}[] = [
  {
    context: "dating",
    icon: "/icon-dating.svg",
    iconWidth: 34,
    iconHeight: 30,
    title: "Dating",
    description: "A shareable \"what I'm like romantically\" blueprint. No matching in MVP.",
    tags: "Playful · warm · curious",
    accent: "text-[#FF9C9F]",
    blob: "bg-[#FF6961]",
  },
  {
    context: "friendship",
    icon: "/icon-friendship.svg",
    iconWidth: 39,
    iconHeight: 29,
    title: "Friendship",
    description: "Show people your social energy, interests, quirks, and friend style.",
    tags: "Casual · energetic · funny",
    accent: "text-[#FFB1D0]",
    blob: "bg-[#FF96C3]",
  },
  {
    context: "get_to_know",
    icon: "/icon-get-to-know.svg",
    iconWidth: 34,
    iconHeight: 31,
    title: "Getting to Know Me",
    description: "A broad, personality-first blueprint for anyone you want to share with.",
    tags: "Curious · expressive · playful",
    accent: "text-[#9FE1CA]",
    blob: "bg-[#8FE3B0]",
  },
];

// A real browser navigation, not router.push — Next's client-side router
// tracks the current route itself, separately from the browser's own
// address bar/history, and a gesture-driven back navigation (swipe, or any
// path that restores this page from the back-forward cache) bypasses that
// tracking entirely: the URL changes but the router's own idea of "where
// we are" doesn't update with it. router.push for a route the router
// (wrongly) believes is already current can silently no-op — which reads
// exactly like "I picked a different vibe and nothing happened," and only
// the browser's own real back button (which doesn't hit this desync)
// recovers it. A full navigation here sidesteps that router state
// entirely, at the cost of a real page load instead of a client transition
// — a fine trade for a once-per-vibe-pick action.
function goToBuilder(context: ProfileContext) {
  window.location.href = `/create/build?context=${context}`;
}

// Scripted turns (dating's name/age) don't count as "real" — losing them
// costs nothing, they're re-asked in seconds. Matches BuilderView's own
// switch-vibe confirm logic exactly, so the two can never disagree about
// what's worth confirming over.
function hasRealAnswers(draft: GuestDraft): boolean {
  const scriptedCount = draft.context === "dating" ? SCRIPTED_OPENING_QUESTIONS.length : 0;
  return draft.conversation.some((turn, i) => i >= scriptedCount && turn.status === "answered");
}

// The picker never auto-forwards — it always renders the three cards below.
// A resumable draft (if any) surfaces as a small banner above them, not a
// blocking modal: swiping/navigating back here after picking a vibe must
// land on an actually-usable picker, not get bounced straight back into
// the builder.
export function ContextPicker() {
  const [draft, setDraft] = useState<GuestDraft | null>(null);
  const [pendingContext, setPendingContext] = useState<ProfileContext | null>(null);

  useEffect(() => {
    function refresh() {
      const existing = loadDraft();
      // A draft with no answered turns yet is indistinguishable from a
      // fresh start — nothing to "continue", so don't show the banner.
      setDraft(existing && existing.conversation.length > 0 ? existing : null);
    }
    refresh();
    // iOS Safari can restore this page from the back-forward cache (e.g.
    // after a swipe-back from the builder) without re-running this effect
    // at all — pageshow with persisted:true is the signal that happened,
    // so the draft gets re-read fresh instead of the banner silently
    // showing whatever was true back when this page was first cached.
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) refresh();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  function handleStartFresh() {
    clearDraftConversation();
    setDraft(null);
  }

  function pick(context: ProfileContext) {
    // No resumable draft, or picking the same vibe that's already in
    // progress: straight through, nothing to lose.
    if (!draft || draft.context === context) {
      goToBuilder(context);
      return;
    }
    if (!hasRealAnswers(draft)) {
      clearDraftConversation();
      goToBuilder(context);
      return;
    }
    setPendingContext(context);
  }

  function confirmSwitch() {
    if (!pendingContext) return;
    // Clears only the in-progress conversation (draft.summary is always
    // null here — a finished draft redirects out of the builder long
    // before reaching this picker again — and the photo isn't
    // context-specific, see clearDraftConversation in guest-draft.ts).
    clearDraftConversation();
    goToBuilder(pendingContext);
  }

  return (
    <>
      {draft && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2A2726] bg-[#171514] px-4 py-3">
          <div className="text-[13px] text-white/80">
            <span className="font-bold text-white">Continue your {CONTEXT_LABEL[draft.context]} Vibecheck?</span>{" "}
            <span className="text-white/50">
              You&apos;ve answered {draft.conversation.length} question{draft.conversation.length === 1 ? "" : "s"}{" "}
              so far.
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => goToBuilder(draft.context)}
              className="rounded-full bg-[#FF96C3] px-3.5 py-2 text-[12px] font-extrabold text-neutral-900"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={handleStartFresh}
              className="rounded-full border border-[#2A2726] px-3.5 py-2 text-[12px] font-semibold text-white/70 hover:bg-[#1F1B1A]"
            >
              Start Fresh
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {CONTEXTS.map((c) => (
          <button
            key={c.context}
            type="button"
            onClick={() => pick(c.context)}
            className="group relative flex min-h-[210px] flex-col items-center justify-between overflow-hidden rounded-[22px] border border-[#2A2726] bg-[#171514] p-5 text-center transition-colors hover:border-[#4A4541]"
          >
            <span
              className={`pointer-events-none absolute -top-10 -right-10 h-[170px] w-[170px] rounded-full opacity-15 ${c.blob}`}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.icon} alt="" width={c.iconWidth} height={c.iconHeight} className="relative" />
            <div className="relative">
              <h3 className="font-inter text-[24px] leading-[100%] font-bold tracking-[-0.72px] text-[#FFFDF9]">
                {c.title}
              </h3>
              <p className="mt-1.5 font-inter text-[16px] leading-[100%] font-normal text-[#D8D1CB]">
                {c.description}
              </p>
            </div>
            <div className={`relative mt-3 font-inter text-[12px] leading-[100%] font-bold ${c.accent}`}>
              {c.tags}
            </div>
          </button>
        ))}
      </div>

      {pendingContext && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="switch-vibe-title"
            className="w-full max-w-[380px] rounded-[22px] border border-[#2A2726] bg-[#151313] p-6 text-center"
          >
            <div className="text-[28px]">🔄</div>
            <h2 id="switch-vibe-title" className="mt-2 text-[18px] font-black text-white">
              Switch vibes?
            </h2>
            <p className="mt-1.5 text-[13px] text-white/60">
              Your current answers for this {draft ? CONTEXT_LABEL[draft.context] : ""} Vibecheck will be lost.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={confirmSwitch}
                className="h-[44px] rounded-[14px] bg-[#FF96C3] text-[14px] font-extrabold text-neutral-900"
              >
                Switch vibes
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setPendingContext(null)}
                className="h-[44px] rounded-[14px] border border-[#2A2726] text-[14px] font-extrabold text-white/80 hover:bg-[#1A1817]"
              >
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
